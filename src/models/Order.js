const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orders_idorders: { type: Number, required: true, unique: true },
    store_code: { type: String, required: true },
    project_code: { type: String, required: true },
    order_date: { type: Date },
    delivery_date: { type: String },
    total_items: { type: Number, default: 0 },
    total_amount: { type: Number, default: 0 },
    delivery_details: { type: String, default: null },
    latitude: { type: String, default: null },
    longitude: { type: String, default: null },
    status: {
      type: String,
      enum: ["pending", "assigned", "in_progress", "completed", "rejected", "cancelled"],
      default: "pending",
    },
    sent_to_super_admin: { type: Boolean, default: false },
    sent_to_super_admin_at: { type: Date, default: null },
    sent_to_super_admin_by: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser", default: null },
    delivery_status: {
      type: String,
      enum: [
        "ready_for_delivery",
        "assigned",
        "out_for_delivery",
        "delivered",
        "failed",
        "cancelled",
      ],
      default: null,
    },
    delivery_slot: { type: String, default: null },
    current_delivery_assignment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryAssignment",
      default: null,
    },
    current_route_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryRoute",
      default: null,
    },
    // Total delivery attempts made (1 = original dispatch). Capped at
    // MAX_DELIVERY_ATTEMPTS; further re-attempts are blocked once reached.
    delivery_attempts: { type: Number, default: 0 },
    synced_at: { type: Date, default: Date.now },
    // Outbox for notifying the upstream e-commerce system on delivery.
    // Set to pending when delivery_status becomes "delivered"; the sync
    // worker posts to RIDER_DELIVERED_API_URL until synced or max attempts.
    upstream_sync: {
      status: { type: String, enum: ["pending", "synced", "failed"], default: null },
      attempts: { type: Number, default: 0 },
      last_error: { type: String, default: null },
      synced_at: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

orderSchema.index({ store_code: 1, status: 1 });
orderSchema.index({ store_code: 1, delivery_status: 1 });
orderSchema.index({ sent_to_super_admin: 1, sent_to_super_admin_at: -1 });
orderSchema.index({ "upstream_sync.status": 1 });

module.exports = mongoose.model("Order", orderSchema, "orders");
