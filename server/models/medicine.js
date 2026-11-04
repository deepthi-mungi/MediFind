const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    strength: {
      type: String,
      trim: true,
      default: ""
    },
    formulation: {
      type: String,
      trim: true,
      default: "Tablet"
    },
    manufacturer: {
      type: String,
      trim: true,
      default: ""
    },
    pharmacy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pharmacy",
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    price: {
      type: Number,
      default: null,
      min: 0
    },
    available: {
      type: Boolean,
      default: true
    },
    category: {
      type: String,
      trim: true,
      default: "General"
    },
    description: {
      type: String,
      trim: true,
      default: ""
    },
    requiresPrescription: {
      type: Boolean,
      default: false
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

medicineSchema.index({ pharmacy: 1, name: 1 });
medicineSchema.index({ name: 1, available: 1, quantity: 1 });
medicineSchema.index({ category: 1 });

module.exports = mongoose.model("Medicine", medicineSchema);
