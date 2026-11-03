
const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
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
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Medicine", medicineSchema);
