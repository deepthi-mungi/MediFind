const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const pharmacyRoutes = require("./routes/pharmacy");
const medicineRoutes = require("./routes/medicine");
const adminRoutes = require("./routes/admin");
const orderRoutes = require("./routes/order");
const paymentRoutes = require("./routes/payment");
const notificationRoutes = require("./routes/notification");
const { createRateLimiter } = require("./middleware/rateLimit");

const User = require("./models/user");
const Pharmacy = require("./models/pharmacy");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// Profile photos and prescriptions are sent as base64 data URLs, so allow a 6 MB JSON body.
app.use(express.json({ limit: "6mb" }));

// Apply rate limiters
const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many authentication attempts. Please try again in a minute."
});
const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: "Too many API requests. Please slow down."
});

app.get("/", (req, res) => {
  res.send("MediFind backend is running!");
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/pharmacy", apiLimiter, pharmacyRoutes);
app.use("/api/medicines", apiLimiter, medicineRoutes);
app.use("/api/admin", apiLimiter, adminRoutes);
app.use("/api/orders", apiLimiter, orderRoutes);
app.use("/api/payments", apiLimiter, paymentRoutes);
app.use("/api/notifications", apiLimiter, notificationRoutes);

async function bootstrapAdminAndRecords() {
  // 1. Ensure existing pharmacy records without verificationStatus are marked "pending" for admin review
  // (Never auto-approve unknown existing pharmacy records)
  const migrationResult = await Pharmacy.updateMany(
    {
      $or: [
        { verificationStatus: { $exists: false } },
        { verificationStatus: null }
      ]
    },
    {
      $set: {
        verificationStatus: "pending",
        rejectionReason: ""
      }
    }
  );

  if (migrationResult.modifiedCount > 0) {
    console.log(
      `Marked ${migrationResult.modifiedCount} existing pharmacy record(s) as pending for admin review.`
    );
  }

  // Sync GeoJSON 2dsphere location coordinates for existing pharmacies with latitude/longitude
  const pharmaciesToSync = await Pharmacy.find({
    latitude: { $ne: null },
    longitude: { $ne: null }
  });

  for (const pharm of pharmaciesToSync) {
    const coords = pharm.location?.coordinates || [];
    if (
      coords.length !== 2 ||
      coords[0] !== Number(pharm.longitude) ||
      coords[1] !== Number(pharm.latitude)
    ) {
      pharm.location = {
        type: "Point",
        coordinates: [Number(pharm.longitude), Number(pharm.latitude)]
      };
      await pharm.save();
    }
  }

  // 2. Ensure Administrator account exists and stays synced with .env configuration
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@medifind.com")
    .trim()
    .toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@1234";
  const adminName = (process.env.ADMIN_NAME || "Platform Admin").trim();

  const existingAdmin = await User.findOne({ role: "admin" });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    await User.create({
      name: adminName,
      email: adminEmail,
      phone: "",
      password: hashedPassword,
      role: "admin",
      isActive: true
    });
    console.log(`Default administrator created: ${adminEmail}`);
  } else {
    let updated = false;
    if (existingAdmin.email !== adminEmail) {
      existingAdmin.email = adminEmail;
      updated = true;
    }
    if (process.env.ADMIN_NAME && existingAdmin.name !== adminName) {
      existingAdmin.name = adminName;
      updated = true;
    }
    const passwordMatches = await bcrypt.compare(
      adminPassword,
      existingAdmin.password
    );
    if (!passwordMatches) {
      existingAdmin.password = await bcrypt.hash(adminPassword, 12);
      updated = true;
    }
    if (existingAdmin.isActive === false) {
      existingAdmin.isActive = true;
      updated = true;
    }
    if (updated) {
      await existingAdmin.save();
      console.log(
        `Administrator credentials synced from .env for: ${adminEmail}`
      );
    }
  }
}

async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing from .env");
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from .env");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected successfully!");

    await bootstrapAdminAndRecords();

    app.listen(PORT, () => {
      console.log(`MediFind running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
