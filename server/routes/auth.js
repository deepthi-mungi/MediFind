
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/user");
const Pharmacy = require("../models/pharmacy");

const router = express.Router();

// Generate login token
function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// CUSTOMER REGISTRATION
router.post("/register/customer", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        message: "Name, email and password are required."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters."
      });
    }

    const existingUser = await User.findOne({
      email: email.trim().toLowerCase()
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email is already registered."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || "",
      password: hashedPassword,
      role: "customer"
    });

    res.status(201).json({
      message: "Customer registered successfully!",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error("Customer registration error:", error);

    res.status(500).json({
      message: "Customer registration failed."
    });
  }
});

// PHARMACY REGISTRATION
router.post("/register/pharmacy", async (req, res) => {
  let createdUserId = null;

  try {
    const {
      name,
      email,
      password,
      pharmacyName,
      phone,
      address,
      latitude,
      longitude,
      openingTime,
      closingTime
    } = req.body;

    if (
      !name?.trim() ||
      !email?.trim() ||
      !password ||
      !pharmacyName?.trim() ||
      !phone?.trim() ||
      !address?.trim() ||
      latitude === undefined ||
      longitude === undefined
    ) {
      return res.status(400).json({
        message: "Please provide all required pharmacy details."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters."
      });
    }

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (
      !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lon) || lon < -180 || lon > 180
    ) {
      return res.status(400).json({
        message: "Please provide valid pharmacy GPS coordinates."
      });
    }

    const existingUser = await User.findOne({
      email: email.trim().toLowerCase()
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email is already registered."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      password: hashedPassword,
      role: "pharmacy"
    });

    createdUserId = user._id;

    const pharmacy = await Pharmacy.create({
      owner: user._id,
      pharmacyName: pharmacyName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      latitude: lat,
      longitude: lon,
      openingTime: openingTime || "",
      closingTime: closingTime || ""
    });

    res.status(201).json({
      message: "Pharmacy registered successfully!",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      pharmacy
    });

  } catch (error) {
    // Remove the user if pharmacy profile creation failed
    if (createdUserId) {
      await User.findByIdAndDelete(createdUserId);
    }

    console.error("Pharmacy registration error:", error);

    res.status(500).json({
      message: "Pharmacy registration failed."
    });
  }
});

// LOGIN FOR CUSTOMERS AND PHARMACIES
router.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email?.trim() || !password || !role) {
      return res.status(400).json({
        message: "Email, password and role are required."
      });
    }

    if (!["customer", "pharmacy"].includes(role)) {
      return res.status(400).json({
        message: "Invalid account type."
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
      role
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const token = generateToken(user);

    let pharmacy = null;

    if (user.role === "pharmacy") {
      pharmacy = await Pharmacy.findOne({ owner: user._id });

      if (!pharmacy) {
        return res.status(404).json({
          message: "Pharmacy profile not found."
        });
      }
    }

    res.json({
      message: "Login successful!",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      pharmacy
    });

  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Login failed."
    });
  }
});

module.exports = router;
