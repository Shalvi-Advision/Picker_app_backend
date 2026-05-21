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
      enum: ["pending", "assigned", "in_progress", "completed", "rejected"],
      default: "pending",
    },
    sent_to_super_admin: { type: Boolean, default: false },
    sent_to_super_admin_at: { type: Date, default: null },
    sent_to_super_admin_by: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser", default: null },
    synced_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

orderSchema.index({ store_code: 1, status: 1 });
orderSchema.index({ sent_to_super_admin: 1, sent_to_super_admin_at: -1 });

module.exports = mongoose.model("Order", orderSchema, "orders");
