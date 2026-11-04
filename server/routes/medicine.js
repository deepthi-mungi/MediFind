const express = require("express");
const Medicine = require("../models/medicine");
const Pharmacy = require("../models/pharmacy");
const { authenticateToken, authorizeRole } = require("../middleware/auth");
const { progressiveRadiusDiscovery } = require("../utils/geo");

const router = express.Router();

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// PUBLIC: AUTOCOMPLETE MEDICINE SUGGESTIONS
router.get("/suggestions", async (req, res) => {
  try {
    const { q = "" } = req.query;
    if (!q.trim()) {
      return res.json([]);
    }

    const safe = escapeRegex(q.trim());
    const medicines = await Medicine.find({
      name: { $regex: safe, $options: "i" },
      quantity: { $gt: 0 },
      available: true
    })
      .populate("pharmacy", "verificationStatus isSuspended")
      .limit(40)
      .lean();

    const grouped = new Map();
    for (const med of medicines) {
      if (
        !med.pharmacy ||
        med.pharmacy.verificationStatus !== "approved" ||
        med.pharmacy.isSuspended
      ) {
        continue;
      }
      const key = med.name.toLowerCase();
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          name: med.name,
          strength: med.strength || "",
          formulation: med.formulation || "Tablet",
          category: med.category || "General",
          pharmacyCount: 1,
          lowestPrice: med.price != null ? med.price : null
        });
      } else {
        existing.pharmacyCount += 1;
        if (
          med.price != null &&
          (existing.lowestPrice == null || med.price < existing.lowestPrice)
        ) {
          existing.lowestPrice = med.price;
        }
      }
    }

    return res.json(Array.from(grouped.values()).slice(0, 8));
  } catch (error) {
    console.error("Medicine suggestions error:", error);
    return res.status(500).json({ message: "Unable to load suggestions." });
  }
});

// PUBLIC: MEDICINE CATEGORIES
router.get("/categories", async (req, res) => {
  try {
    const medicines = await Medicine.find({
      quantity: { $gt: 0 },
      available: true
    })
      .populate("pharmacy", "verificationStatus isSuspended")
      .select("category pharmacy")
      .lean();

    const categoryCounts = new Map();
    for (const med of medicines) {
      if (
        !med.pharmacy ||
        med.pharmacy.verificationStatus !== "approved" ||
        med.pharmacy.isSuspended
      ) {
        continue;
      }
      const cat = med.category || "General";
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }

    const defaultCategories = [
      "Fever & Pain",
      "Antibiotics",
      "Cold & Cough",
      "Diabetes Care",
      "Cardiac Care",
      "Vitamins & Supplements",
      "First Aid",
      "General"
    ];

    for (const preset of defaultCategories) {
      if (!categoryCounts.has(preset)) {
        categoryCounts.set(preset, 0);
      }
    }

    const result = Array.from(categoryCounts.entries()).map(
      ([name, count]) => ({
        name,
        count
      })
    );

    return res.json(result);
  } catch (error) {
    console.error("Categories error:", error);
    return res.status(500).json({ message: "Unable to load categories." });
  }
});

// CUSTOMER: SEARCH MEDICINES (Only from Admin-Approved Pharmacies)
router.get("/search", async (req, res) => {
  try {
    const {
      name = "",
      category = "",
      maxPrice,
      includeOutOfStock = "false",
      lat,
      lng,
      radiusKm = "all",
      autoExpand = "true",
      sortBy = "distance",
      includeMeta = "false"
    } = req.query;

    if (!name?.trim() && (!category?.trim() || category === "all")) {
      return res.status(400).json({
        message: "Please enter a medicine name."
      });
    }

    const query = {};
    if (name?.trim()) {
      const safePattern = escapeRegex(name.trim());
      query.name = { $regex: safePattern, $options: "i" };
    }

    if (category?.trim() && category !== "all") {
      query.category = category.trim();
    }

    if (includeOutOfStock !== "true") {
      query.quantity = { $gt: 0 };
      query.available = true;
    }

    if (
      maxPrice !== undefined &&
      maxPrice !== "" &&
      Number.isFinite(Number(maxPrice))
    ) {
      query.price = { $lte: Number(maxPrice) };
    }

    const medicines = await Medicine.find(query)
      .populate(
        "pharmacy",
        "pharmacyName address phone latitude longitude openingTime closingTime verificationStatus isSuspended profileImage deliveryAvailable deliveryFee"
      )
      .sort({ name: 1 })
      .lean();

    // Only expose medicines belonging to verified/approved and non-suspended pharmacies
    const verifiedMedicines = medicines.filter(
      item =>
        item.pharmacy &&
        item.pharmacy.verificationStatus === "approved" &&
        !item.pharmacy.isSuspended
    );

    const discovery = progressiveRadiusDiscovery(
      verifiedMedicines,
      item => item.pharmacy,
      {
        lat,
        lng,
        radiusKm: radiusKm === "all" ? "all" : Number(radiusKm) || 3,
        autoExpand: autoExpand !== "false",
        minResults: 1,
        steps: [3, 5, 10]
      }
    );

    let finalResults = discovery.results;

    if (sortBy === "price_asc") {
      finalResults = [...finalResults].sort((a, b) => {
        if (a.price == null) return 1;
        if (b.price == null) return -1;
        return a.price - b.price;
      });
    } else if (sortBy === "price_desc") {
      finalResults = [...finalResults].sort((a, b) => {
        if (a.price == null) return 1;
        if (b.price == null) return -1;
        return b.price - a.price;
      });
    } else if (sortBy === "name") {
      finalResults = [...finalResults].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    }

    if (includeMeta === "true") {
      return res.json({
        results: finalResults,
        radiusMeta: {
          initialRadiusKm: discovery.initialRadiusKm,
          appliedRadiusKm: discovery.appliedRadiusKm,
          wasExpanded: discovery.wasExpanded,
          expansionStepsTried: discovery.expansionStepsTried,
          hasMoreOutsideRadius: discovery.hasMoreOutsideRadius,
          nearestAvailableDistanceKm: discovery.nearestAvailableDistanceKm,
          totalAvailableEverywhere: discovery.totalAvailableEverywhere
        }
      });
    }

    return res.json(finalResults);
  } catch (error) {
    console.error("Medicine search error:", error);
    return res.status(500).json({
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
      const {
        name,
        strength,
        formulation,
        manufacturer,
        quantity,
        price,
        category,
        description,
        requiresPrescription,
        available
      } = req.body;

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

      const isAvailable =
        available !== undefined
          ? Boolean(available) && parsedQuantity > 0
          : parsedQuantity > 0;

      const medicine = await Medicine.create({
        name: name.trim(),
        strength: strength?.trim() || "",
        formulation: formulation?.trim() || "Tablet",
        manufacturer: manufacturer?.trim() || "",
        pharmacy: pharmacy._id,
        quantity: parsedQuantity,
        price: parsedPrice,
        available: isAvailable,
        category: category?.trim() || "General",
        description: description?.trim() || "",
        requiresPrescription: Boolean(requiresPrescription),
        lastUpdated: new Date()
      });

      return res.status(201).json({
        message: "Medicine added successfully!",
        medicine
      });
    } catch (error) {
      console.error("Add medicine error:", error);
      return res.status(500).json({
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

      return res.json(medicines);
    } catch (error) {
      console.error("Inventory error:", error);
      return res.status(500).json({
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

      const existingMedicine = await Medicine.findOne({
        _id: req.params.id,
        pharmacy: pharmacy._id
      });

      if (!existingMedicine) {
        return res.status(404).json({
          message: "Medicine not found in your inventory."
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

      if (req.body.strength !== undefined) {
        updates.strength = req.body.strength.trim();
      }

      if (req.body.formulation !== undefined) {
        updates.formulation = req.body.formulation.trim() || "Tablet";
      }

      if (req.body.manufacturer !== undefined) {
        updates.manufacturer = req.body.manufacturer.trim();
      }

      if (req.body.category !== undefined) {
        updates.category = req.body.category.trim() || "General";
      }

      if (req.body.description !== undefined) {
        updates.description = req.body.description.trim();
      }

      if (req.body.requiresPrescription !== undefined) {
        updates.requiresPrescription = Boolean(req.body.requiresPrescription);
      }

      let nextQuantity = existingMedicine.quantity;
      if (req.body.quantity !== undefined) {
        const quantity = Number(req.body.quantity);

        if (!Number.isInteger(quantity) || quantity < 0) {
          return res.status(400).json({
            message: "Invalid quantity."
          });
        }

        nextQuantity = quantity;
        updates.quantity = quantity;
      }

      if (req.body.available !== undefined) {
        updates.available = Boolean(req.body.available) && nextQuantity > 0;
      } else if (req.body.quantity !== undefined) {
        updates.available = nextQuantity > 0;
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
        { returnDocument: "after", runValidators: true }
      );

      return res.json({
        message: "Medicine updated successfully!",
        medicine
      });
    } catch (error) {
      console.error("Update medicine error:", error);
      return res.status(500).json({
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

      return res.json({
        message: "Medicine deleted successfully!"
      });
    } catch (error) {
      console.error("Delete medicine error:", error);
      return res.status(500).json({
        message: "Unable to delete medicine."
      });
    }
  }
);

module.exports = router;
