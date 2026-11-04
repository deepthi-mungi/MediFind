const express = require("express");
const crypto = require("crypto");
const Order = require("../models/order");
const Payment = require("../models/payment");
const Pharmacy = require("../models/pharmacy");
const Notification = require("../models/notification");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateToken);

function getGatewayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || "";
  const isLiveConfigured =
    Boolean(keyId && keySecret) &&
    !keyId.includes("your_") &&
    !keySecret.includes("your_");

  return {
    isLiveConfigured,
    keyId: isLiveConfigured ? keyId : "rzp_test_mediFindSandbox",
    signingSecret: isLiveConfigured
      ? keySecret
      : `${process.env.JWT_SECRET}_razorpay_sandbox_secret`
  };
}

// 1. CREATE PAYMENT ORDER (RAZORPAY LIVE OR SANDBOX TESTING MODE)
router.post("/create-order", authorizeRole("customer"), async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    const order = await Order.findOne({
      _id: orderId,
      customer: req.user.id
    }).populate("pharmacy", "pharmacyName");

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({ message: "Order is already paid." });
    }

    if (["cancelled", "rejected"].includes(order.orderStatus)) {
      return res
        .status(400)
        .json({ message: "Cannot pay for a cancelled or rejected order." });
    }

    const { isLiveConfigured, keyId, signingSecret } = getGatewayConfig();
    const amountInPaise = Math.round(order.totalAmount * 100);
    let gatewayOrderId = `order_sandbox_${Date.now()}_${crypto
      .randomBytes(3)
      .toString("hex")}`;
    let gatewayMode = "sandbox";

    if (isLiveConfigured) {
      const auth = Buffer.from(`${keyId}:${signingSecret}`).toString("base64");
      const rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: "INR",
          receipt: order.orderNumber
        })
      });

      const rzpData = await rzpResponse.json();
      if (!rzpResponse.ok || !rzpData.id) {
        return res.status(502).json({
          message:
            rzpData?.error?.description ||
            "Unable to initialize Razorpay order."
        });
      }

      gatewayOrderId = rzpData.id;
      gatewayMode = "razorpay";
    }

    const payment = await Payment.create({
      order: order._id,
      customer: req.user.id,
      pharmacy: order.pharmacy._id,
      amount: order.totalAmount,
      currency: "INR",
      gateway: gatewayMode,
      gatewayOrderId,
      status: "created"
    });

    order.payment = payment._id;
    order.paymentMethod = gatewayMode;
    await order.save();

    return res.status(201).json({
      paymentRecordId: payment._id,
      orderId: order._id,
      orderNumber: order.orderNumber,
      pharmacyName: order.pharmacy.pharmacyName,
      amount: order.totalAmount,
      amountInPaise,
      currency: "INR",
      gatewayOrderId,
      mode: gatewayMode,
      keyId
    });
  } catch (error) {
    console.error("Create payment order error:", error);
    return res
      .status(500)
      .json({ message: "Unable to initialize online payment." });
  }
});

// 2. SANDBOX PAYMENT AUTHORIZATION HELPER (Generates server-side test payment ID + HMAC signature in Sandbox Mode)
router.post(
  "/sandbox-authorize",
  authorizeRole("customer"),
  async (req, res) => {
    try {
      const { gatewayOrderId, method = "upi" } = req.body;
      const { isLiveConfigured, signingSecret } = getGatewayConfig();

      if (isLiveConfigured) {
        return res.status(400).json({
          message: "Sandbox authorization is disabled when live Razorpay keys are active."
        });
      }

      const payment = await Payment.findOne({
        gatewayOrderId,
        customer: req.user.id
      });

      if (!payment) {
        return res.status(404).json({ message: "Payment session not found." });
      }

      const gatewayPaymentId = `pay_sandbox_${Date.now()}_${crypto
        .randomBytes(3)
        .toString("hex")}`;

      const signature = crypto
        .createHmac("sha256", signingSecret)
        .update(`${gatewayOrderId}|${gatewayPaymentId}`)
        .digest("hex");

      return res.json({
        razorpay_order_id: gatewayOrderId,
        razorpay_payment_id: gatewayPaymentId,
        razorpay_signature: signature,
        method
      });
    } catch (error) {
      console.error("Sandbox payment authorize error:", error);
      return res
        .status(500)
        .json({ message: "Sandbox payment authorization failed." });
    }
  }
);

// 3. CRYPTOGRAPHIC HMAC SHA-256 SIGNATURE VERIFICATION
router.post("/verify", authorizeRole("customer"), async (req, res) => {
  try {
    const {
      orderId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      method = "upi"
    } = req.body;

    if (
      !orderId ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        message: "Missing payment verification parameters."
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      customer: req.user.id
    }).populate("pharmacy", "owner pharmacyName");

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const payment = await Payment.findOne({
      order: order._id,
      gatewayOrderId: razorpay_order_id,
      customer: req.user.id
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment record not found." });
    }

    const { signingSecret } = getGatewayConfig();
    const expectedSignature = crypto
      .createHmac("sha256", signingSecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const sigBufferA = Buffer.from(expectedSignature, "utf8");
    const sigBufferB = Buffer.from(String(razorpay_signature), "utf8");

    const isSignatureValid =
      sigBufferA.length === sigBufferB.length &&
      crypto.timingSafeEqual(sigBufferA, sigBufferB);

    if (!isSignatureValid) {
      payment.status = "failed";
      await payment.save();

      order.paymentStatus = "failed";
      order.statusHistory.push({
        status: "payment_failed",
        note: "HMAC SHA-256 signature verification failed.",
        timestamp: new Date()
      });
      await order.save();

      return res.status(400).json({
        message: "Payment signature verification failed."
      });
    }

    payment.gatewayPaymentId = razorpay_payment_id;
    payment.gatewaySignature = razorpay_signature;
    payment.method = method;
    payment.status = "paid";
    payment.paidAt = new Date();
    await payment.save();

    order.paymentStatus = "paid";
    order.payment = payment._id;
    order.statusHistory.push({
      status: "paid",
      note: `Online payment verified (${razorpay_payment_id}).`,
      timestamp: new Date()
    });
    await order.save();

    await Notification.create({
      recipient: req.user.id,
      title: `Payment Confirmed (${order.orderNumber})`,
      message: `₹${order.totalAmount} paid successfully for order ${order.orderNumber}.`,
      type: "payment",
      relatedOrder: order._id
    });

    if (order.pharmacy?.owner) {
      await Notification.create({
        recipient: order.pharmacy.owner,
        title: `Payment Received (${order.orderNumber})`,
        message: `Online payment of ₹${order.totalAmount} verified for order ${order.orderNumber}.`,
        type: "payment",
        relatedOrder: order._id
      });
    }

    return res.json({
      message: "Payment verified successfully! Your order is confirmed.",
      order,
      payment
    });
  } catch (error) {
    console.error("Verify payment error:", error);
    return res
      .status(500)
      .json({ message: "Payment verification encountered an error." });
  }
});

module.exports = router;
