const mongoose = require("mongoose");

const routeStopSchema = new mongoose.Schema(
  {
    sequence: { type: Number, required: true },
    orders_idorders: { type: Number, required: true },
    latitude: { type: String, default: null },
    longitude: { type: String, default: null },
    status: {
      type: String,
      enum: ["pending", "delivered", "failed"],
      default: "pending",
    },
  },
  { _id: false }
);

const deliveryRouteSchema = new mongoose.Schema(
  {
    store_code: { type: String, required: true },
    project_code: { type: String, required: true },
    rider_id: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser", required: true },
    assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser", default: null },
    delivery_date: { type: String, default: null },
    delivery_slot: { type: String, default: null },
    status: {
      type: String,
      enum: ["planned", "in_progress", "completed", "cancelled"],
      default: "planned",
    },
    stops: { type: [routeStopSchema], default: [] },
    estimated_duration_min: { type: Number, default: null },
    estimated_distance_km: { type: Number, default: null },
    started_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

deliveryRouteSchema.index({ store_code: 1, status: 1 });
deliveryRouteSchema.index({ rider_id: 1, status: 1 });

module.exports = mongoose.model("DeliveryRoute", deliveryRouteSchema, "delivery_routes");
