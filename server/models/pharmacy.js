const mongoose = require("mongoose");

const pharmacySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: undefined
    },
    pharmacyName: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      required: true,
      trim: true
    },
    phone: { type: String, default: "" },
    latitude: { type: Number, default: null, min: -90, max: 90 },
    longitude: { type: Number, default: null, min: -180, max: 180 },
    openingTime: { type: String, default: "" },
    closingTime: { type: String, default: "" },
    profileImage: { type: String, default: "" }
  },
  { timestamps: true }
);

pharmacySchema.index(
  { owner: 1 },
  {
    unique: true,
    partialFilterExpression: {
      owner: { $type: "objectId" }
    }
  }
);

module.exports = mongoose.model("Pharmacy", pharmacySchema);
