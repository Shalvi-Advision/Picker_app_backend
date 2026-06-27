const mongoose = require("mongoose");

const proofOfDeliverySchema = new mongoose.Schema(
  {
    photo_urls: { type: [String], default: [] },
    signature_url: { type: String, default: null },
    recipient_name: { type: String, default: null },
    notes: { type: String, default: null },
    latitude: { type: String, default: null },
    longitude: { type: String, default: null },
    captured_at: { type: Date, default: null },
  },
  { _id: false }
);

const deliveryAssignmentSchema = new mongoose.Schema(
  {
    orders_idorders: { type: Number, required: true },
    store_code: { type: String, required: true },
    project_code: { type: String, required: true },
    rider_id: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser", required: true },
    assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser", default: null },
    route_id: { type: mongoose.Schema.Types.ObjectId, ref: "DeliveryRoute", default: null },
    stop_sequence: { type: Number, default: null },
    status: {
      type: String,
      enum: ["assigned", "out_for_delivery", "delivered", "failed", "cancelled"],
      default: "assigned",
    },
    assigned_at: { type: Date, default: Date.now },
    started_at: { type: Date, default: null },
    delivered_at: { type: Date, default: null },
    failed_reason: { type: String, default: null },
    proof_of_delivery: { type: proofOfDeliverySchema, default: () => ({}) },
    reassigned_from: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser", default: null },
    reassigned_at: { type: Date, default: null },
  },
  { timestamps: true }
);

deliveryAssignmentSchema.index({ orders_idorders: 1 });
deliveryAssignmentSchema.index({ rider_id: 1, status: 1 });
deliveryAssignmentSchema.index({ store_code: 1, status: 1 });

module.exports = mongoose.model(
  "DeliveryAssignment",
  deliveryAssignmentSchema,
  "delivery_assignments"
);
