const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const pharmacyRoutes = require("./routes/pharmacy");
const medicineRoutes = require("./routes/medicine");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// Profile photos are sent as base64 data URLs, so allow a larger JSON body.
app.use(express.json({ limit: "4mb" }));

app.get("/", (req, res) => {
  res.send("MediFind backend is running!");
});

app.use("/api/auth", authRoutes);
app.use("/api/pharmacy", pharmacyRoutes);
app.use("/api/medicines", medicineRoutes);

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

    app.listen(PORT, () => {
      console.log(`MediFind running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
