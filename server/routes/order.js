const express = require("express");
const Order = require("../models/order");
const Medicine = require("../models/medicine");
const Pharmacy = require("../models/pharmacy");
const Prescription = require("../models/prescription");
const Payment = require("../models/payment");
const Notification = require("../models/notification");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateToken);

async function restoreOrderStock(order) {
  if (!order.stockReserved) return;
  for (const item of order.items || []) {
    const med = await Medicine.findById(item.medicine);
    if (med) {
      med.quantity += item.quantity;
      med.available = med.quantity > 0;
      med.lastUpdated = new Date();
      await med.save();
    }
  }
  order.stockReserved = false;
}

// CUSTOMER: PLACE ORDER (WITH ATOMIC STOCK RESERVATION & PRESCRIPTION UPLOAD)
router.post("/", authorizeRole("customer"), async (req, res) => {
  const reservedItems = [];
  try {
    const {
      pharmacyId,
      items,
      fulfillmentType,
      deliveryAddress,
      customerPhone,
      customerNotes,
      prescriptionData
    } = req.body;

    if (!pharmacyId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "Cart items and pharmacy selection are required."
      });
    }

    if (!["delivery", "pickup"].includes(fulfillmentType)) {
      return res.status(400).json({
        message: "Please choose Home Delivery or Pharmacy Pickup."
      });
    }

    if (!customerPhone?.trim()) {
      return res.status(400).json({
        message: "Contact phone number is required for order updates."
      });
    }

    if (fulfillmentType === "delivery") {
      if (
        !deliveryAddress?.street?.trim() ||
        !deliveryAddress?.city?.trim() ||
        !deliveryAddress?.pincode?.trim()
      ) {
        return res.status(400).json({
          message:
            "Complete delivery address (street, city, and pincode) is required for Home Delivery."
        });
      }
    }

    const pharmacy = await Pharmacy.findOne({
      _id: pharmacyId,
      verificationStatus: "approved",
      isSuspended: { $ne: true }
    });

    if (!pharmacy) {
      return res.status(404).json({
        message: "Selected pharmacy is not available for ordering."
      });
    }

    if (fulfillmentType === "delivery" && pharmacy.deliveryAvailable === false) {
      return res.status(400).json({
        message: "This pharmacy currently offers Pharmacy Pickup only."
      });
    }

    // Validate items & atomically reserve stock to prevent overselling
    const validatedOrderItems = [];
    let itemsTotal = 0;
    let orderRequiresPrescription = false;

    for (const cartItem of items) {
      const qty = Number(cartItem.quantity);
      if (!cartItem.medicineId || !Number.isInteger(qty) || qty < 1) {
        throw new Error("Invalid medicine quantity in cart.");
      }

      const med = await Medicine.findOne({
        _id: cartItem.medicineId,
        pharmacy: pharmacy._id
      });

      if (!med || !med.available) {
        throw new Error(
          `${cartItem.name || "Requested medicine"} is currently unavailable.`
        );
      }

      if (med.price == null || !Number.isFinite(Number(med.price))) {
        throw new Error(
          `${med.name} does not have an online price listed yet. Please call the pharmacy.`
        );
      }

      // Atomic stock decrement with condition quantity >= qty
      const updatedMed = await Medicine.findOneAndUpdate(
        {
          _id: med._id,
          pharmacy: pharmacy._id,
          available: true,
          quantity: { $gte: qty }
        },
        {
          $inc: { quantity: -qty },
          $set: { lastUpdated: new Date() }
        },
        { returnDocument: "after" }
      );

      if (!updatedMed) {
        throw new Error(
          `Insufficient stock for ${med.name}. Available: ${med.quantity}.`
        );
      }

      if (updatedMed.quantity === 0 && updatedMed.available) {
        updatedMed.available = false;
        await updatedMed.save();
      }

      reservedItems.push({ medicineId: med._id, quantity: qty });

      if (med.requiresPrescription) {
        orderRequiresPrescription = true;
      }

      const subtotal = Number((med.price * qty).toFixed(2));
      itemsTotal += subtotal;

      validatedOrderItems.push({
        medicine: med._id,
        name: med.name,
        strength: med.strength || "",
        formulation: med.formulation || "Tablet",
        price: med.price,
        quantity: qty,
        requiresPrescription: Boolean(med.requiresPrescription),
        subtotal
      });
    }

    // Validate prescription upload if any medicine requires a prescription
    let createdPrescription = null;
    if (orderRequiresPrescription) {
      if (
        !prescriptionData?.fileData ||
        typeof prescriptionData.fileData !== "string" ||
        !/^data:(image\/(png|jpe?g|webp|gif)|application\/pdf);base64,/i.test(
          prescriptionData.fileData
        )
      ) {
        throw new Error(
          "One or more medicines require a valid prescription upload (Image or PDF)."
        );
      }

      if (prescriptionData.fileData.length > 4_000_000) {
        throw new Error("Prescription file must be smaller than 3 MB.");
      }

      createdPrescription = await Prescription.create({
        customer: req.user.id,
        pharmacy: pharmacy._id,
        patientName: prescriptionData.patientName?.trim() || "Customer",
        doctorName: prescriptionData.doctorName?.trim() || "",
        notes: prescriptionData.notes?.trim() || "",
        fileData: prescriptionData.fileData,
        status: "pending"
      });
    }

    const deliveryFee =
      fulfillmentType === "delivery" ? Number(pharmacy.deliveryFee ?? 30) : 0;
    const totalAmount = Number((itemsTotal + deliveryFee).toFixed(2));
    const orderNumber = `MF-${Date.now().toString().slice(-6)}-${Math.floor(
      100 + Math.random() * 900
    )}`;

    const order = await Order.create({
      orderNumber,
      customer: req.user.id,
      pharmacy: pharmacy._id,
      items: validatedOrderItems,
      fulfillmentType,
      deliveryAddress:
        fulfillmentType === "delivery"
          ? {
              recipientName: deliveryAddress.recipientName?.trim() || "",
              phone: deliveryAddress.phone?.trim() || customerPhone.trim(),
              street: deliveryAddress.street.trim(),
              area: deliveryAddress.area?.trim() || "",
              city: deliveryAddress.city.trim(),
              state: deliveryAddress.state?.trim() || "",
              pincode: deliveryAddress.pincode.trim(),
              landmark: deliveryAddress.landmark?.trim() || "",
              latitude: deliveryAddress.latitude ?? null,
              longitude: deliveryAddress.longitude ?? null
            }
          : {},
      customerPhone: customerPhone.trim(),
      customerNotes: customerNotes?.trim() || "",
      requiresPrescription: orderRequiresPrescription,
      prescription: createdPrescription ? createdPrescription._id : null,
      prescriptionStatus: orderRequiresPrescription ? "pending" : "not_required",
      itemsTotal: Number(itemsTotal.toFixed(2)),
      deliveryFee,
      totalAmount,
      paymentStatus: "pending",
      orderStatus: "placed",
      stockReserved: true,
      statusHistory: [
        {
          status: "placed",
          note: "Order created and stock reserved.",
          timestamp: new Date()
        }
      ]
    });

    if (createdPrescription) {
      createdPrescription.order = order._id;
      await createdPrescription.save();
    }

    // Notify Pharmacy Owner
    if (pharmacy.owner) {
      await Notification.create({
        recipient: pharmacy.owner,
        title: `New Order ${order.orderNumber}`,
        message: `New ${fulfillmentType} order for ₹${totalAmount} placed at ${pharmacy.pharmacyName}.`,
        type: "order",
        relatedOrder: order._id
      });
    }

    const populatedOrder = await Order.findById(order._id).populate(
      "pharmacy",
      "pharmacyName address phone latitude longitude openingTime closingTime"
    );

    return res.status(201).json({
      message: "Order created! Complete online payment to confirm.",
      order: populatedOrder
    });
  } catch (error) {
    // Rollback any reserved stock if order creation failed mid-way
    for (const r of reservedItems) {
      const med = await Medicine.findById(r.medicineId);
      if (med) {
        med.quantity += r.quantity;
        med.available = med.quantity > 0;
        await med.save();
      }
    }

    console.error("Create order error:", error);
    return res.status(400).json({
      message: error.message || "Unable to place order."
    });
  }
});

// CUSTOMER: VIEW OWN ORDER HISTORY
router.get("/my-orders", authorizeRole("customer"), async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user.id })
      .populate(
        "pharmacy",
        "pharmacyName address phone latitude longitude openingTime closingTime"
      )
      .populate("payment", "gateway gatewayOrderId gatewayPaymentId status method paidAt refundId")
      .sort({ createdAt: -1 });

    return res.json(orders);
  } catch (error) {
    console.error("Customer orders error:", error);
    return res.status(500).json({ message: "Unable to load your orders." });
  }
});

// CUSTOMER: CANCEL ORDER
router.patch("/:id/cancel", authorizeRole("customer"), async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findOne({
      _id: req.params.id,
      customer: req.user.id
    }).populate("pharmacy", "owner pharmacyName");

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (
      ["out_for_delivery", "completed", "cancelled", "rejected"].includes(
        order.orderStatus
      )
    ) {
      return res.status(400).json({
        message: `Order cannot be cancelled once it is ${order.orderStatus.replace(
          /_/g,
          " "
        )}.`
      });
    }

    await restoreOrderStock(order);

    order.orderStatus = "cancelled";
    order.rejectionOrCancelReason =
      reason?.trim() || "Cancelled by customer.";
    order.statusHistory.push({
      status: "cancelled",
      note: order.rejectionOrCancelReason,
      timestamp: new Date()
    });

    if (order.paymentStatus === "paid") {
      order.paymentStatus = "refunded";
      if (order.payment) {
        await Payment.findByIdAndUpdate(order.payment, {
          $set: {
            status: "refunded",
            refundId: `rfnd_${Date.now()}`,
            refundReason: order.rejectionOrCancelReason,
            refundedAt: new Date()
          }
        });
      }
    }

    await order.save();

    if (order.pharmacy?.owner) {
      await Notification.create({
        recipient: order.pharmacy.owner,
        title: `Order ${order.orderNumber} Cancelled`,
        message: `Customer cancelled order ${order.orderNumber}. Stock has been restored.`,
        type: "order",
        relatedOrder: order._id
      });
    }

    return res.json({
      message:
        order.paymentStatus === "refunded"
          ? "Order cancelled and payment refund initiated!"
          : "Order cancelled and medicine stock restored.",
      order
    });
  } catch (error) {
    console.error("Cancel order error:", error);
    return res.status(500).json({ message: "Unable to cancel order." });
  }
});

// PHARMACY OWNER: VIEW INCOMING ORDERS FOR OWN PHARMACY
router.get("/pharmacy-orders", authorizeRole("pharmacy"), async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findOne({ owner: req.user.id });
    if (!pharmacy) {
      return res.status(404).json({ message: "Pharmacy profile not found." });
    }

    const orders = await Order.find({ pharmacy: pharmacy._id })
      .populate("customer", "name email phone")
      .populate("payment", "gateway gatewayOrderId gatewayPaymentId status method paidAt")
      .populate("prescription", "patientName doctorName notes status verificationNotes verifiedAt")
      .sort({ createdAt: -1 });

    return res.json(orders);
  } catch (error) {
    console.error("Pharmacy orders error:", error);
    return res.status(500).json({ message: "Unable to load pharmacy orders." });
  }
});

// PHARMACY OWNER: VERIFY OR REJECT PRESCRIPTION FOR AN ORDER
router.patch(
  "/:id/verify-prescription",
  authorizeRole("pharmacy"),
  async (req, res) => {
    try {
      const { status, notes } = req.body;
      if (!["verified", "rejected"].includes(status)) {
        return res.status(400).json({
          message: "Prescription status must be verified or rejected."
        });
      }

      const pharmacy = await Pharmacy.findOne({ owner: req.user.id });
      if (!pharmacy) {
        return res.status(404).json({ message: "Pharmacy profile not found." });
      }

      const order = await Order.findOne({
        _id: req.params.id,
        pharmacy: pharmacy._id
      });

      if (!order || !order.requiresPrescription || !order.prescription) {
        return res.status(404).json({
          message: "Prescription-required order not found."
        });
      }

      await Prescription.findByIdAndUpdate(order.prescription, {
        $set: {
          status,
          verifiedBy: req.user.id,
          verificationNotes: notes?.trim() || "",
          verifiedAt: new Date()
        }
      });

      order.prescriptionStatus = status;
      order.statusHistory.push({
        status: `prescription_${status}`,
        note:
          notes?.trim() ||
          `Pharmacist ${status} the uploaded medical prescription.`,
        timestamp: new Date()
      });

      if (status === "rejected") {
        await restoreOrderStock(order);
        order.orderStatus = "rejected";
        order.rejectionOrCancelReason =
          notes?.trim() || "Prescription rejected by pharmacist.";
        if (order.paymentStatus === "paid") {
          order.paymentStatus = "refunded";
          if (order.payment) {
            await Payment.findByIdAndUpdate(order.payment, {
              $set: {
                status: "refunded",
                refundId: `rfnd_${Date.now()}`,
                refundReason: order.rejectionOrCancelReason,
                refundedAt: new Date()
              }
            });
          }
        }
      }

      await order.save();

      await Notification.create({
        recipient: order.customer,
        title: `Prescription ${
          status === "verified" ? "Verified" : "Rejected"
        } (${order.orderNumber})`,
        message:
          status === "verified"
            ? `Your prescription for order ${order.orderNumber} was verified by ${pharmacy.pharmacyName}.`
            : `Your prescription for order ${order.orderNumber} was rejected: ${order.rejectionOrCancelReason}`,
        type: "prescription",
        relatedOrder: order._id
      });

      return res.json({
        message: `Prescription ${status} successfully.`,
        order
      });
    } catch (error) {
      console.error("Verify prescription error:", error);
      return res
        .status(500)
        .json({ message: "Unable to update prescription verification." });
    }
  }
);

// PHARMACY OWNER: UPDATE ORDER STATUS (ACCEPT, REJECT, PREPARING, READY, OUT FOR DELIVERY, COMPLETED)
router.patch("/:id/status", authorizeRole("pharmacy"), async (req, res) => {
  try {
    const { status, note } = req.body;
    const validStatuses = [
      "accepted",
      "rejected",
      "preparing",
      "ready_for_pickup",
      "out_for_delivery",
      "completed"
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid order status." });
    }

    const pharmacy = await Pharmacy.findOne({ owner: req.user.id });
    if (!pharmacy) {
      return res.status(404).json({ message: "Pharmacy profile not found." });
    }

    const order = await Order.findOne({
      _id: req.params.id,
      pharmacy: pharmacy._id
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (["cancelled", "rejected", "completed"].includes(order.orderStatus)) {
      return res.status(400).json({
        message: `Order is already ${order.orderStatus} and cannot be modified.`
      });
    }

    // Require prescription verification before dispensing
    if (
      order.requiresPrescription &&
      ["ready_for_pickup", "out_for_delivery", "completed"].includes(status) &&
      order.prescriptionStatus !== "verified"
    ) {
      return res.status(400).json({
        message:
          "Prescription must be verified by the pharmacist before dispensing or dispatching this order."
      });
    }

    if (status === "rejected") {
      await restoreOrderStock(order);
      order.rejectionOrCancelReason =
        note?.trim() || "Order declined by pharmacy.";

      if (order.paymentStatus === "paid") {
        order.paymentStatus = "refunded";
        if (order.payment) {
          await Payment.findByIdAndUpdate(order.payment, {
            $set: {
              status: "refunded",
              refundId: `rfnd_${Date.now()}`,
              refundReason: order.rejectionOrCancelReason,
              refundedAt: new Date()
            }
          });
        }
      }
    }

    order.orderStatus = status;
    order.statusHistory.push({
      status,
      note: note?.trim() || `Order status updated to ${status.replace(/_/g, " ")}.`,
      timestamp: new Date()
    });

    await order.save();

    await Notification.create({
      recipient: order.customer,
      title: `Order ${order.orderNumber} Update`,
      message: `Your order at ${pharmacy.pharmacyName} is now: ${status
        .replace(/_/g, " ")
        .toUpperCase()}.`,
      type: "order",
      relatedOrder: order._id
    });

    return res.json({
      message: `Order marked as ${status.replace(/_/g, " ")}.`,
      order
    });
  } catch (error) {
    console.error("Update order status error:", error);
    return res.status(500).json({ message: "Unable to update order status." });
  }
});

// SECURE PRESCRIPTION VIEW (RESTRICTED TO ORDER CUSTOMER, ASSIGNED PHARMACY OWNER, OR ADMIN)
router.get("/:id/prescription", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("prescription");
    if (!order || !order.prescription) {
      return res.status(404).json({ message: "Prescription not found." });
    }

    let authorized = false;
    if (req.user.role === "admin") {
      authorized = true;
    } else if (
      req.user.role === "customer" &&
      order.customer.toString() === req.user.id
    ) {
      authorized = true;
    } else if (req.user.role === "pharmacy") {
      const pharmacy = await Pharmacy.findOne({ owner: req.user.id });
      if (pharmacy && order.pharmacy.toString() === pharmacy._id.toString()) {
        authorized = true;
      }
    }

    if (!authorized) {
      return res.status(403).json({
        message: "You are not authorized to view this medical prescription."
      });
    }

    return res.json(order.prescription);
  } catch (error) {
    console.error("View prescription error:", error);
    return res.status(500).json({ message: "Unable to load prescription." });
  }
});

module.exports = router;
