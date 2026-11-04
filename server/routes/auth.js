const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/user");
const Pharmacy = require("../models/pharmacy");
const Address = require("../models/address");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

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
    const { name, email, phone, password, address } = req.body;

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
      address: address?.trim() || "",
      password: hashedPassword,
      role: "customer",
      isActive: true
    });

    res.status(201).json({
      message: "Customer registered successfully!",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
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
      closingTime,
      licenseNumber
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
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180
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
      role: "pharmacy",
      isActive: true
    });

    createdUserId = user._id;

    const pharmacy = await Pharmacy.create({
      owner: user._id,
      pharmacyName: pharmacyName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      latitude: lat,
      longitude: lon,
      location: {
        type: "Point",
        coordinates: [lon, lat]
      },
      openingTime: openingTime || "",
      closingTime: closingTime || "",
      licenseNumber: licenseNumber?.trim() || "",
      verificationStatus: "pending"
    });

    res.status(201).json({
      message:
        "Pharmacy registered! Your account is pending administrator verification.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
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

// LOGIN FOR CUSTOMERS, PHARMACIES AND ADMINISTRATORS
router.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email?.trim() || !password || !role) {
      return res.status(400).json({
        message: "Email, password and role are required."
      });
    }

    if (!["customer", "pharmacy", "admin"].includes(role)) {
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

    if (user.isActive === false) {
      return res.status(403).json({
        message:
          "Your account has been deactivated. Please contact the administrator."
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

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
        phone: user.phone || "",
        address: user.address || "",
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

// GET CURRENT USER PROFILE
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.json(user);
  } catch (error) {
    console.error("Get user profile error:", error);
    return res.status(500).json({ message: "Unable to load profile." });
  }
});

// UPDATE CURRENT USER PROFILE
router.put("/me", authenticateToken, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: "Name is required." });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          name: name.trim(),
          phone: phone?.trim() || "",
          address: address?.trim() || ""
        }
      },
      { returnDocument: "after", runValidators: true }
    ).select("-password");

    return res.json({
      message: "Profile updated successfully!",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        address: user.address || "",
        role: user.role
      }
    });
  } catch (error) {
    console.error("Update user profile error:", error);
    return res.status(500).json({ message: "Unable to update profile." });
  }
});

// CUSTOMER SAVED ADDRESSES
router.get(
  "/addresses",
  authenticateToken,
  authorizeRole("customer"),
  async (req, res) => {
    try {
      const addresses = await Address.find({ user: req.user.id }).sort({
        isDefault: -1,
        createdAt: -1
      });
      return res.json(addresses);
    } catch (error) {
      console.error("Get addresses error:", error);
      return res.status(500).json({ message: "Unable to load addresses." });
    }
  }
);

router.post(
  "/addresses",
  authenticateToken,
  authorizeRole("customer"),
  async (req, res) => {
    try {
      const {
        label,
        recipientName,
        phone,
        street,
        area,
        city,
        state,
        pincode,
        landmark,
        latitude,
        longitude,
        isDefault
      } = req.body;

      if (
        !recipientName?.trim() ||
        !phone?.trim() ||
        !street?.trim() ||
        !city?.trim() ||
        !pincode?.trim()
      ) {
        return res.status(400).json({
          message:
            "Recipient name, phone, street, city and pincode are required."
        });
      }

      if (isDefault) {
        await Address.updateMany(
          { user: req.user.id },
          { $set: { isDefault: false } }
        );
      }

      const address = await Address.create({
        user: req.user.id,
        label: ["Home", "Work", "Other"].includes(label) ? label : "Home",
        recipientName: recipientName.trim(),
        phone: phone.trim(),
        street: street.trim(),
        area: area?.trim() || "",
        city: city.trim(),
        state: state?.trim() || "",
        pincode: pincode.trim(),
        landmark: landmark?.trim() || "",
        latitude:
          latitude !== undefined &&
          latitude !== "" &&
          latitude !== null &&
          Number.isFinite(Number(latitude))
            ? Number(latitude)
            : null,
        longitude:
          longitude !== undefined &&
          longitude !== "" &&
          longitude !== null &&
          Number.isFinite(Number(longitude))
            ? Number(longitude)
            : null,
        isDefault: Boolean(isDefault)
      });

      return res.status(201).json({
        message: "Delivery address saved!",
        address
      });
    } catch (error) {
      console.error("Save address error:", error);
      return res.status(500).json({ message: "Unable to save address." });
    }
  }
);

router.delete(
  "/addresses/:id",
  authenticateToken,
  authorizeRole("customer"),
  async (req, res) => {
    try {
      const deleted = await Address.findOneAndDelete({
        _id: req.params.id,
        user: req.user.id
      });
      if (!deleted) {
        return res.status(404).json({ message: "Address not found." });
      }
      return res.json({ message: "Address removed." });
    } catch (error) {
      console.error("Delete address error:", error);
      return res.status(500).json({ message: "Unable to remove address." });
    }
  }
);

module.exports = router;
