const express = require("express");
const Pharmacy = require("../models/pharmacy");
const Medicine = require("../models/medicine");
const Order = require("../models/order");
const { authenticateToken, authorizeRole } = require("../middleware/auth");
const {
  calculateDistanceKm,
  isPharmacyOpenNow,
  progressiveRadiusDiscovery
} = require("../utils/geo");

const router = express.Router();

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ====================================================
// PUBLIC CUSTOMER ENDPOINTS: NEARBY & INDIVIDUAL PAGE
// ====================================================

// Discover nearby approved pharmacies without searching a medicine
// Starts at 3 km and expands progressively to 5 km -> 10 km when needed
router.get("/nearby", async (req, res) => {
  try {
    const {
      lat,
      lng,
      radiusKm = 3,
      autoExpand = "true",
      minResults = 1,
      search = ""
    } = req.query;

    const filter = {
      verificationStatus: "approved",
      isSuspended: { $ne: true }
    };

    if (search?.trim()) {
      const safe = escapeRegex(search.trim());
      filter.$or = [
        { pharmacyName: { $regex: safe, $options: "i" } },
        { address: { $regex: safe, $options: "i" } }
      ];
    }

    const pharmacies = await Pharmacy.find(filter)
      .select(
        "pharmacyName address phone latitude longitude openingTime closingTime profileImage licenseNumber verificationStatus deliveryAvailable deliveryFee"
      )
      .lean();

    // Attach medicine inventory counts
    const pharmacyIds = pharmacies.map(p => p._id);
    const counts = await Medicine.aggregate([
      {
        $match: {
          pharmacy: { $in: pharmacyIds },
          available: true,
          quantity: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: "$pharmacy",
          inStockMedicines: { $sum: 1 }
        }
      }
    ]);

    const countMap = new Map(
      counts.map(item => [item._id.toString(), item.inStockMedicines])
    );

    const enriched = pharmacies.map(p => ({
      ...p,
      inStockMedicines: countMap.get(p._id.toString()) || 0
    }));

    const discovery = progressiveRadiusDiscovery(
      enriched,
      item => item,
      {
        lat,
        lng,
        radiusKm: radiusKm === "all" ? "all" : Number(radiusKm) || 3,
        autoExpand: autoExpand !== "false",
        minResults: Number(minResults) || 1,
        steps: [3, 5, 10]
      }
    );

    return res.json({
      pharmacies: discovery.results,
      radiusMeta: {
        initialRadiusKm: discovery.initialRadiusKm,
        appliedRadiusKm: discovery.appliedRadiusKm,
        wasExpanded: discovery.wasExpanded,
        expansionStepsTried: discovery.expansionStepsTried,
        hasMoreOutsideRadius: discovery.hasMoreOutsideRadius,
        nearestAvailableDistanceKm: discovery.nearestAvailableDistanceKm,
        totalAvailableEverywhere: discovery.totalAvailableEverywhere
      }
    });
  } catch (error) {
    console.error("Nearby pharmacies error:", error);
    return res
      .status(500)
      .json({ message: "Unable to load nearby pharmacies." });
  }
});

// Public Dedicated Pharmacy Storefront & Complete Inventory
router.get("/:id/public", async (req, res) => {
  try {
    const { lat, lng, q = "", category = "all", inStockOnly = "false" } = req.query;

    const pharmacy = await Pharmacy.findOne({
      _id: req.params.id,
      verificationStatus: "approved",
      isSuspended: { $ne: true }
    })
      .select(
        "pharmacyName address phone latitude longitude openingTime closingTime profileImage licenseNumber verificationStatus deliveryAvailable deliveryFee"
      )
      .lean();

    if (!pharmacy) {
      return res.status(404).json({
        message: "Pharmacy not found or not currently verified."
      });
    }

    const medFilter = { pharmacy: pharmacy._id };
    if (inStockOnly === "true") {
      medFilter.available = true;
      medFilter.quantity = { $gt: 0 };
    }
    if (category && category !== "all") {
      medFilter.category = category;
    }
    if (q?.trim()) {
      const safe = escapeRegex(q.trim());
      medFilter.$or = [
        { name: { $regex: safe, $options: "i" } },
        { category: { $regex: safe, $options: "i" } },
        { formulation: { $regex: safe, $options: "i" } }
      ];
    }

    const medicines = await Medicine.find(medFilter)
      .sort({ available: -1, name: 1 })
      .lean();

    const distance =
      lat !== undefined &&
      lng !== undefined &&
      pharmacy.latitude != null &&
      pharmacy.longitude != null
        ? calculateDistanceKm(lat, lng, pharmacy.latitude, pharmacy.longitude)
        : null;

    const isOpen = isPharmacyOpenNow(
      pharmacy.openingTime,
      pharmacy.closingTime
    );

    return res.json({
      pharmacy: {
        ...pharmacy,
        distance,
        isOpen
      },
      medicines
    });
  } catch (error) {
    console.error("Get public pharmacy details error:", error);
    return res
      .status(500)
      .json({ message: "Unable to load pharmacy inventory." });
  }
});

// ====================================================
// PROTECTED PHARMACY OWNER ENDPOINTS
// ====================================================

router.use(authenticateToken);
router.use(authorizeRole("pharmacy"));

// Get the logged-in owner's pharmacy profile.
router.get("/me", async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findOne({
      owner: req.user.id || req.user._id
    });

    if (!pharmacy) {
      return res.status(404).json({ message: "Pharmacy profile not found." });
    }

    return res.json(pharmacy);
  } catch (error) {
    console.error("Get pharmacy profile error:", error);
    return res
      .status(500)
      .json({ message: "Could not load pharmacy profile." });
  }
});

// Update only the logged-in owner's pharmacy profile.
router.put("/me", async (req, res) => {
  try {
    const ownerId = req.user.id || req.user._id;
    const {
      pharmacyName,
      address,
      phone,
      latitude,
      longitude,
      openingTime,
      closingTime,
      profileImage,
      licenseNumber,
      deliveryAvailable,
      deliveryFee,
      reapply
    } = req.body;

    if (!pharmacyName?.trim() || !address?.trim()) {
      return res.status(400).json({
        message: "Pharmacy name and address are required."
      });
    }

    if (latitude !== null && latitude !== "" && latitude !== undefined) {
      if (
        !Number.isFinite(Number(latitude)) ||
        Number(latitude) < -90 ||
        Number(latitude) > 90
      ) {
        return res.status(400).json({ message: "Enter a valid latitude." });
      }
    }

    if (longitude !== null && longitude !== "" && longitude !== undefined) {
      if (
        !Number.isFinite(Number(longitude)) ||
        Number(longitude) < -180 ||
        Number(longitude) > 180
      ) {
        return res.status(400).json({ message: "Enter a valid longitude." });
      }
    }

    if (
      profileImage &&
      (typeof profileImage !== "string" ||
        !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(profileImage))
    ) {
      return res.status(400).json({ message: "Please upload a valid image." });
    }

    if (profileImage && profileImage.length > 3_000_000) {
      return res.status(413).json({
        message: "Image is too large. Choose an image smaller than 2 MB."
      });
    }

    const existingPharmacy = await Pharmacy.findOne({ owner: ownerId });

    if (!existingPharmacy) {
      return res.status(404).json({ message: "Pharmacy profile not found." });
    }

    const parsedLat =
      latitude === "" || latitude === undefined || latitude === null
        ? null
        : Number(latitude);
    const parsedLng =
      longitude === "" || longitude === undefined || longitude === null
        ? null
        : Number(longitude);

    const update = {
      pharmacyName: pharmacyName.trim(),
      address: address.trim(),
      phone: phone || "",
      latitude: parsedLat,
      longitude: parsedLng,
      openingTime: openingTime || "",
      closingTime: closingTime || ""
    };

    if (parsedLat != null && parsedLng != null) {
      update.location = {
        type: "Point",
        coordinates: [parsedLng, parsedLat]
      };
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "licenseNumber")) {
      update.licenseNumber = licenseNumber ? licenseNumber.trim() : "";
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "deliveryAvailable")) {
      update.deliveryAvailable = Boolean(deliveryAvailable);
    }

    if (
      deliveryFee !== undefined &&
      deliveryFee !== "" &&
      Number.isFinite(Number(deliveryFee)) &&
      Number(deliveryFee) >= 0
    ) {
      update.deliveryFee = Number(deliveryFee);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "profileImage")) {
      update.profileImage = profileImage || "";
    }

    if (reapply && existingPharmacy.verificationStatus === "rejected") {
      update.verificationStatus = "pending";
      update.rejectionReason = "";
    }

    const pharmacy = await Pharmacy.findOneAndUpdate(
      { owner: ownerId },
      { $set: update },
      { returnDocument: "after", runValidators: true }
    );

    return res.json({
      message: reapply
        ? "Pharmacy profile updated and resubmitted for admin verification."
        : "Pharmacy profile updated successfully.",
      pharmacy
    });
  } catch (error) {
    console.error("Update pharmacy profile error:", error);
    return res
      .status(500)
      .json({ message: "Could not update pharmacy profile." });
  }
});

// Pharmacy Owner Sales & Inventory Analytics Report
router.get("/analytics", async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findOne({ owner: req.user.id });
    if (!pharmacy) {
      return res.status(404).json({ message: "Pharmacy profile not found." });
    }

    const [medicines, orders] = await Promise.all([
      Medicine.find({ pharmacy: pharmacy._id }).lean(),
      Order.find({ pharmacy: pharmacy._id })
        .sort({ createdAt: -1 })
        .populate("customer", "name email phone")
        .lean()
    ]);

    const totalMedicines = medicines.length;
    const inStockCount = medicines.filter(
      m => m.available && m.quantity > 0
    ).length;
    const outOfStockCount = totalMedicines - inStockCount;
    const lowStockItems = medicines.filter(
      m => m.quantity > 0 && m.quantity <= 10
    );

    const totalOrders = orders.length;
    const completedOrders = orders.filter(
      o => o.orderStatus === "completed"
    ).length;
    const activeOrders = orders.filter(o =>
      [
        "placed",
        "accepted",
        "preparing",
        "ready_for_pickup",
        "out_for_delivery"
      ].includes(o.orderStatus)
    ).length;
    const cancelledOrRejectedOrders = orders.filter(o =>
      ["cancelled", "rejected"].includes(o.orderStatus)
    ).length;

    const totalRevenue = orders
      .filter(
        o =>
          o.paymentStatus === "paid" &&
          !["cancelled", "rejected"].includes(o.orderStatus)
      )
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    // Top selling medicines in this pharmacy
    const itemSalesMap = new Map();
    for (const order of orders) {
      if (["cancelled", "rejected"].includes(order.orderStatus)) continue;
      for (const item of order.items || []) {
        const prev = itemSalesMap.get(item.name) || {
          name: item.name,
          unitsSold: 0,
          revenue: 0
        };
        prev.unitsSold += item.quantity || 0;
        prev.revenue += item.subtotal || 0;
        itemSalesMap.set(item.name, prev);
      }
    }

    const topSellingMedicines = Array.from(itemSalesMap.values())
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 5);

    return res.json({
      inventorySummary: {
        totalMedicines,
        inStockCount,
        outOfStockCount,
        lowStockCount: lowStockItems.length,
        lowStockItems: lowStockItems.slice(0, 8)
      },
      salesSummary: {
        totalOrders,
        completedOrders,
        activeOrders,
        cancelledOrRejectedOrders,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        topSellingMedicines
      }
    });
  } catch (error) {
    console.error("Pharmacy analytics error:", error);
    return res
      .status(500)
      .json({ message: "Unable to load sales and inventory report." });
  }
});

module.exports = router;
