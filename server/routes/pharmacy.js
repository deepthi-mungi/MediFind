const express = require("express");
const mongoose = require("mongoose");
const Pharmacy = require("../models/pharmacy");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateToken);
router.use(authorizeRole("pharmacy"));

// Get the logged-in owner's pharmacy profile.
router.get("/me", async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findOne({ owner: req.user.id || req.user._id });

    if (!pharmacy) {
      return res.status(404).json({ message: "Pharmacy profile not found." });
    }

    return res.json(pharmacy);
  } catch (error) {
    console.error("Get pharmacy profile error:", error);
    return res.status(500).json({ message: "Could not load pharmacy profile." });
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
      profileImage
    } = req.body;

    if (!pharmacyName?.trim() || !address?.trim()) {
      return res.status(400).json({
        message: "Pharmacy name and address are required."
      });
    }

    if (latitude !== null && latitude !== "" && latitude !== undefined) {
      if (!Number.isFinite(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90) {
        return res.status(400).json({ message: "Enter a valid latitude." });
      }
    }

    if (longitude !== null && longitude !== "" && longitude !== undefined) {
      if (!Number.isFinite(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180) {
        return res.status(400).json({ message: "Enter a valid longitude." });
      }
    }

    if (profileImage && (
      typeof profileImage !== "string" ||
      !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(profileImage)
    )) {
      return res.status(400).json({ message: "Please upload a valid image." });
    }

    // Keep image payload bounded even if a request bypasses frontend checks.
    if (profileImage && profileImage.length > 3_000_000) {
      return res.status(413).json({ message: "Image is too large. Choose an image smaller than 2 MB." });
    }

    const update = {
      pharmacyName: pharmacyName.trim(),
      address: address.trim(),
      phone: phone || "",
      latitude: latitude === "" || latitude === undefined ? null : latitude,
      longitude: longitude === "" || longitude === undefined ? null : longitude,
      openingTime: openingTime || "",
      closingTime: closingTime || ""
    };

    // Only update image if the request includes the property.
    if (Object.prototype.hasOwnProperty.call(req.body, "profileImage")) {
      update.profileImage = profileImage || "";
    }

    const pharmacy = await Pharmacy.findOneAndUpdate(
      { owner: ownerId },
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!pharmacy) {
      return res.status(404).json({ message: "Pharmacy profile not found." });
    }

    return res.json({
      message: "Pharmacy profile updated successfully.",
      pharmacy
    });
  } catch (error) {
    console.error("Update pharmacy profile error:", error);
    return res.status(500).json({ message: "Could not update pharmacy profile." });
  }
});

module.exports = router;
