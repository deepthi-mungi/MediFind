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
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point"
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      }
    },
    openingTime: { type: String, default: "" },
    closingTime: { type: String, default: "" },
    profileImage: { type: String, default: "" },
    licenseNumber: { type: String, trim: true, default: "" },
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending"
    },
    isSuspended: { type: Boolean, default: false },
    rejectionReason: { type: String, trim: true, default: "" },
    verifiedAt: { type: Date, default: null },
    deliveryAvailable: { type: Boolean, default: true },
    deliveryFee: { type: Number, default: 30, min: 0 }
  },
  { timestamps: true }
);

pharmacySchema.pre("save", function () {
  if (
    this.latitude != null &&
    this.longitude != null &&
    Number.isFinite(Number(this.latitude)) &&
    Number.isFinite(Number(this.longitude))
  ) {
    this.location = {
      type: "Point",
      coordinates: [Number(this.longitude), Number(this.latitude)]
    };
  }
});

pharmacySchema.index(
  { owner: 1 },
  {
    unique: true,
    partialFilterExpression: {
      owner: { $type: "objectId" }
    }
  }
);

pharmacySchema.index({ location: "2dsphere" });
pharmacySchema.index({ verificationStatus: 1 });

module.exports = mongoose.model("Pharmacy", pharmacySchema);
