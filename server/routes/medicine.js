
const express = require("express");
const Medicine = require("../models/medicine");
const Pharmacy = require("../models/pharmacy");

const {
  authenticateToken,
  authorizeRole
} = require("../middleware/auth");

const router = express.Router();

// CUSTOMER: SEARCH MEDICINES
router.get("/search", async (req, res) => {
  try {
    const { name } = req.query;

    if (!name?.trim()) {
      return res.status(400).json({
        message: "Please enter a medicine name."
      });
    }

    const medicines = await Medicine.find({
      name: { $regex: name.trim(), $options: "i" },
      quantity: { $gt: 0 },
      available: true
    })
      .populate("pharmacy", "pharmacyName address phone latitude longitude openingTime closingTime")
      .sort({ name: 1 });

    res.json(medicines);
  } catch (error) {
    console.error("Medicine search error:", error);
    res.status(500).json({
      message: "Unable to search medicines."
    });
  }
});

// PHARMACY OWNER: ADD MEDICINE
router.post(
  "/",
  authenticateToken,
  authorizeRole("pharmacy"),
  async (req, res) => {
    try {
      const { name, quantity, price } = req.body;

      if (!name?.trim() || quantity === undefined) {
        return res.status(400).json({
          message: "Medicine name and quantity are required."
        });
      }

      const parsedQuantity = Number(quantity);
      const parsedPrice =
        price === "" || price === undefined || price === null
          ? null
          : Number(price);

      if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
        return res.status(400).json({
          message: "Quantity must be a non-negative whole number."
        });
      }

      if (
        parsedPrice !== null &&
        (!Number.isFinite(parsedPrice) || parsedPrice < 0)
      ) {
        return res.status(400).json({
          message: "Please enter a valid price."
        });
      }

      const pharmacy = await Pharmacy.findOne({
        owner: req.user.id
      });

      if (!pharmacy) {
        return res.status(404).json({
          message: "Pharmacy profile not found."
        });
      }

      const medicine = await Medicine.create({
        name: name.trim(),
        pharmacy: pharmacy._id,
        quantity: parsedQuantity,
        price: parsedPrice,
        available: parsedQuantity > 0,
        lastUpdated: new Date()
      });

      res.status(201).json({
        message: "Medicine added successfully!",
        medicine
      });
    } catch (error) {
      console.error("Add medicine error:", error);
      res.status(500).json({
        message: "Unable to add medicine."
      });
    }
  }
);

// PHARMACY OWNER: VIEW OWN INVENTORY
router.get(
  "/my-inventory",
  authenticateToken,
  authorizeRole("pharmacy"),
  async (req, res) => {
    try {
      const pharmacy = await Pharmacy.findOne({
        owner: req.user.id
      });

      if (!pharmacy) {
        return res.status(404).json({
          message: "Pharmacy profile not found."
        });
      }

      const medicines = await Medicine.find({
        pharmacy: pharmacy._id
      }).sort({ name: 1 });

      res.json(medicines);
    } catch (error) {
      console.error("Inventory error:", error);
      res.status(500).json({
        message: "Unable to fetch inventory."
      });
    }
  }
);

// PHARMACY OWNER: UPDATE OWN MEDICINE
router.put(
  "/:id",
  authenticateToken,
  authorizeRole("pharmacy"),
  async (req, res) => {
    try {
      const pharmacy = await Pharmacy.findOne({
        owner: req.user.id
      });

      if (!pharmacy) {
        return res.status(404).json({
          message: "Pharmacy profile not found."
        });
      }

      const updates = {};

      if (req.body.name !== undefined) {
        if (!req.body.name.trim()) {
          return res.status(400).json({
            message: "Medicine name cannot be empty."
          });
        }
        updates.name = req.body.name.trim();
      }

      if (req.body.quantity !== undefined) {
        const quantity = Number(req.body.quantity);

        if (!Number.isInteger(quantity) || quantity < 0) {
          return res.status(400).json({
            message: "Invalid quantity."
          });
        }

        updates.quantity = quantity;
        updates.available = quantity > 0;
      }

      if (req.body.price !== undefined) {
        const price =
          req.body.price === "" || req.body.price === null
            ? null
            : Number(req.body.price);

        if (price !== null && (!Number.isFinite(price) || price < 0)) {
          return res.status(400).json({
            message: "Invalid price."
          });
        }

        updates.price = price;
      }

      updates.lastUpdated = new Date();

      const medicine = await Medicine.findOneAndUpdate(
        {
          _id: req.params.id,
          pharmacy: pharmacy._id
        },
        { $set: updates },
        { new: true, runValidators: true }
      );

      if (!medicine) {
        return res.status(404).json({
          message: "Medicine not found in your inventory."
        });
      }

      res.json({
        message: "Medicine updated successfully!",
        medicine
      });
    } catch (error) {
      console.error("Update medicine error:", error);
      res.status(500).json({
        message: "Unable to update medicine."
      });
    }
  }
);

// PHARMACY OWNER: DELETE OWN MEDICINE
router.delete(
  "/:id",
  authenticateToken,
  authorizeRole("pharmacy"),
  async (req, res) => {
    try {
      const pharmacy = await Pharmacy.findOne({
        owner: req.user.id
      });

      if (!pharmacy) {
        return res.status(404).json({
          message: "Pharmacy profile not found."
        });
      }

      const medicine = await Medicine.findOneAndDelete({
        _id: req.params.id,
        pharmacy: pharmacy._id
      });

      if (!medicine) {
        return res.status(404).json({
          message: "Medicine not found in your inventory."
        });
      }

      res.json({
        message: "Medicine deleted successfully!"
      });
    } catch (error) {
      console.error("Delete medicine error:", error);
      res.status(500).json({
        message: "Unable to delete medicine."
      });
    }
  }
);

module.exports = router;
