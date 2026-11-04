const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
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
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: "INR"
    },
    gateway: {
      type: String,
      enum: ["razorpay", "sandbox"],
      default: "sandbox"
    },
    gatewayOrderId: {
      type: String,
      required: true,
      index: true
    },
    gatewayPaymentId: {
      type: String,
      default: ""
    },
    gatewaySignature: {
      type: String,
      default: ""
    },
    method: {
      type: String,
      default: "upi"
    },
    status: {
      type: String,
      enum: ["created", "paid", "failed", "refunded"],
      default: "created"
    },
    refundId: {
      type: String,
      default: ""
    },
    refundReason: {
      type: String,
      default: ""
    },
    refundedAt: {
      type: Date,
      default: null
    },
    paidAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
