const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Medicine",
      required: true
    },
    name: { type: String, required: true },
    strength: { type: String, default: "" },
    formulation: { type: String, default: "Tablet" },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    requiresPrescription: { type: Boolean, default: false },
    subtotal: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    pharmacy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pharmacy",
      required: true,
      index: true
    },
    items: {
      type: [orderItemSchema],
      required: true
    },
    fulfillmentType: {
      type: String,
      enum: ["delivery", "pickup"],
      required: true
    },
    deliveryAddress: {
      recipientName: { type: String, default: "" },
      phone: { type: String, default: "" },
      street: { type: String, default: "" },
      area: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
      landmark: { type: String, default: "" },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null }
    },
    customerPhone: {
      type: String,
      required: true,
      trim: true
    },
    customerNotes: {
      type: String,
      trim: true,
      default: ""
    },
    requiresPrescription: {
      type: Boolean,
      default: false
    },
    prescription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prescription",
      default: null
    },
    prescriptionStatus: {
      type: String,
      enum: ["not_required", "pending", "verified", "rejected"],
      default: "not_required"
    },
    itemsTotal: {
      type: Number,
      required: true,
      min: 0
    },
    deliveryFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    paymentMethod: {
      type: String,
      enum: ["razorpay", "sandbox"],
      default: "sandbox"
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending"
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null
    },
    orderStatus: {
      type: String,
      enum: [
        "placed",
        "accepted",
        "rejected",
        "preparing",
        "ready_for_pickup",
        "out_for_delivery",
        "completed",
        "cancelled"
      ],
      default: "placed"
    },
    rejectionOrCancelReason: {
      type: String,
      trim: true,
      default: ""
    },
    stockReserved: {
      type: Boolean,
      default: true
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        note: { type: String, default: "" },
        timestamp: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
