const express = require("express");
const User = require("../models/user");
const Pharmacy = require("../models/pharmacy");
const Medicine = require("../models/medicine");
const Order = require("../models/order");
const Payment = require("../models/payment");
const Prescription = require("../models/prescription");
const Notification = require("../models/notification");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// Protect all admin routes
router.use(authenticateToken);
router.use(authorizeRole("admin"));

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// PLATFORM OVERVIEW STATS & ANALYTICS
router.get("/stats", async (req, res) => {
  try {
    const [
      totalUsers,
      totalCustomers,
      totalPharmacies,
      pendingPharmacies,
      approvedPharmacies,
      rejectedPharmacies,
      suspendedPharmacies,
      totalMedicines,
      totalOrders,
      completedOrders,
      paidPayments,
      totalPrescriptions
    ] = await Promise.all([
      User.countDocuments({ role: { $in: ["customer", "pharmacy"] } }),
      User.countDocuments({ role: "customer" }),
      Pharmacy.countDocuments(),
      Pharmacy.countDocuments({
        $or: [
          { verificationStatus: "pending" },
          { verificationStatus: { $exists: false } },
          { verificationStatus: null }
        ]
      }),
      Pharmacy.countDocuments({
        verificationStatus: "approved",
        isSuspended: { $ne: true }
      }),
      Pharmacy.countDocuments({ verificationStatus: "rejected" }),
      Pharmacy.countDocuments({
        $or: [{ verificationStatus: "suspended" }, { isSuspended: true }]
      }),
      Medicine.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ orderStatus: "completed" }),
      Payment.find({ status: "paid" }).select("amount").lean(),
      Prescription.countDocuments()
    ]);

    const totalRevenue = paidPayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

    return res.json({
      totalUsers,
      totalCustomers,
      totalPharmacies,
      pendingPharmacies,
      approvedPharmacies,
      rejectedPharmacies,
      suspendedPharmacies,
      totalMedicines,
      totalOrders,
      completedOrders,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalPrescriptions
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return res
      .status(500)
      .json({ message: "Unable to load platform statistics." });
  }
});

// LIST ALL PHARMACIES FOR VERIFICATION, SUSPENSION & REVIEW
router.get("/pharmacies", async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && status !== "all") {
      if (status === "pending") {
        filter.$or = [
          { verificationStatus: "pending" },
          { verificationStatus: { $exists: false } },
          { verificationStatus: null }
        ];
      } else if (status === "suspended") {
        filter.$or = [
          { verificationStatus: "suspended" },
          { isSuspended: true }
        ];
      } else if (["approved", "rejected"].includes(status)) {
        filter.verificationStatus = status;
      }
    }

    if (search?.trim()) {
      const pattern = escapeRegex(search.trim());
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { pharmacyName: { $regex: pattern, $options: "i" } },
            { address: { $regex: pattern, $options: "i" } },
            { phone: { $regex: pattern, $options: "i" } },
            { licenseNumber: { $regex: pattern, $options: "i" } }
          ]
        }
      ];
    }

    const pharmacies = await Pharmacy.find(filter)
      .populate("owner", "name email phone isActive createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const pharmacyIds = pharmacies.map(p => p._id);
    const medicineCounts = await Medicine.aggregate([
      { $match: { pharmacy: { $in: pharmacyIds } } },
      {
        $group: {
          _id: "$pharmacy",
          totalMedicines: { $sum: 1 },
          inStockMedicines: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ["$quantity", 0] }, "$available"] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const countMap = new Map(
      medicineCounts.map(item => [item._id.toString(), item])
    );

    const enriched = pharmacies.map(pharmacy => {
      const counts = countMap.get(pharmacy._id.toString()) || {
        totalMedicines: 0,
        inStockMedicines: 0
      };
      return {
        ...pharmacy,
        verificationStatus: pharmacy.verificationStatus || "pending",
        totalMedicines: counts.totalMedicines,
        inStockMedicines: counts.inStockMedicines
      };
    });

    return res.json(enriched);
  } catch (error) {
    console.error("Admin list pharmacies error:", error);
    return res.status(500).json({ message: "Unable to load pharmacies." });
  }
});

// VERIFY (APPROVE / REJECT / SUSPEND / RESET TO PENDING) A PHARMACY
router.patch("/pharmacies/:id/verify", async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    if (!["approved", "rejected", "pending", "suspended"].includes(status)) {
      return res.status(400).json({
        message:
          "Invalid verification status. Choose approved, rejected, suspended, or pending."
      });
    }

    const update = {
      verificationStatus: status,
      isSuspended: status === "suspended",
      rejectionReason: ["rejected", "suspended"].includes(status)
        ? rejectionReason?.trim() ||
          (status === "suspended"
            ? "Suspended by platform administrator."
            : "Verification requirements not met.")
        : "",
      verifiedAt: status === "approved" ? new Date() : null
    };

    const pharmacy = await Pharmacy.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { returnDocument: "after", runValidators: true }
    ).populate("owner", "name email phone isActive");

    if (!pharmacy) {
      return res.status(404).json({ message: "Pharmacy not found." });
    }

    if (pharmacy.owner?._id) {
      await Notification.create({
        recipient: pharmacy.owner._id,
        title: `Pharmacy Status: ${status.toUpperCase()}`,
        message:
          status === "approved"
            ? `Congratulations! ${pharmacy.pharmacyName} has been approved and is now live.`
            : `${pharmacy.pharmacyName} status updated to ${status}. ${update.rejectionReason}`,
        type: "verification"
      });
    }

    return res.json({
      message:
        status === "approved"
          ? `${pharmacy.pharmacyName} has been approved!`
          : status === "rejected"
            ? `${pharmacy.pharmacyName} has been rejected.`
            : status === "suspended"
              ? `${pharmacy.pharmacyName} has been suspended.`
              : `${pharmacy.pharmacyName} moved back to pending review.`,
      pharmacy
    });
  } catch (error) {
    console.error("Verify pharmacy error:", error);
    return res
      .status(500)
      .json({ message: "Unable to update pharmacy verification status." });
  }
});

// LIST PLATFORM USERS
router.get("/users", async (req, res) => {
  try {
    const { role, search } = req.query;
    const filter = { role: { $in: ["customer", "pharmacy"] } };

    if (role && ["customer", "pharmacy"].includes(role)) {
      filter.role = role;
    }

    if (search?.trim()) {
      const pattern = escapeRegex(search.trim());
      filter.$or = [
        { name: { $regex: pattern, $options: "i" } },
        { email: { $regex: pattern, $options: "i" } },
        { phone: { $regex: pattern, $options: "i" } }
      ];
    }

    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(users);
  } catch (error) {
    console.error("Admin list users error:", error);
    return res.status(500).json({ message: "Unable to load users." });
  }
});

// ACTIVATE OR DEACTIVATE USER ACCOUNT
router.patch("/users/:id/status", async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res
        .status(400)
        .json({ message: "isActive boolean is required." });
    }

    if (req.params.id === req.user.id) {
      return res
        .status(400)
        .json({ message: "You cannot deactivate your own admin account." });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive } },
      { returnDocument: "after" }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json({
      message: `User account ${
        isActive ? "activated" : "deactivated"
      } successfully.`,
      user
    });
  } catch (error) {
    console.error("Update user status error:", error);
    return res.status(500).json({ message: "Unable to update user status." });
  }
});

// ADMIN MEDICINE CATALOG MANAGEMENT
router.get("/medicines", async (req, res) => {
  try {
    const { search = "", category = "all" } = req.query;
    const filter = {};
    if (category && category !== "all") {
      filter.category = category;
    }
    if (search?.trim()) {
      const safe = escapeRegex(search.trim());
      filter.name = { $regex: safe, $options: "i" };
    }

    const medicines = await Medicine.find(filter)
      .populate("pharmacy", "pharmacyName verificationStatus address phone")
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();

    return res.json(medicines);
  } catch (error) {
    console.error("Admin medicines catalog error:", error);
    return res
      .status(500)
      .json({ message: "Unable to load medicine catalog." });
  }
});

router.delete("/medicines/:id", async (req, res) => {
  try {
    const med = await Medicine.findByIdAndDelete(req.params.id);
    if (!med) {
      return res.status(404).json({ message: "Medicine not found." });
    }
    return res.json({ message: "Medicine removed from platform catalog." });
  } catch (error) {
    console.error("Admin delete medicine error:", error);
    return res.status(500).json({ message: "Unable to delete medicine." });
  }
});

// ADMIN ORDER MONITORING
router.get("/orders", async (req, res) => {
  try {
    const { status = "all" } = req.query;
    const filter = {};
    if (status && status !== "all") {
      filter.orderStatus = status;
    }

    const orders = await Order.find(filter)
      .populate("customer", "name email phone")
      .populate("pharmacy", "pharmacyName phone address")
      .populate("payment", "gateway gatewayOrderId gatewayPaymentId status amount method paidAt")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json(orders);
  } catch (error) {
    console.error("Admin orders error:", error);
    return res
      .status(500)
      .json({ message: "Unable to load platform orders." });
  }
});

// ADMIN PAYMENT MONITORING
router.get("/payments", async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate("customer", "name email phone")
      .populate("pharmacy", "pharmacyName")
      .populate("order", "orderNumber totalAmount orderStatus fulfillmentType")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json(payments);
  } catch (error) {
    console.error("Admin payments error:", error);
    return res
      .status(500)
      .json({ message: "Unable to load payment records." });
  }
});

module.exports = router;
