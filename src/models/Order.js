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
    status: {
      type: String,
      enum: ["pending", "assigned", "in_progress", "completed", "rejected"],
      default: "pending",
    },
    synced_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

orderSchema.index({ store_code: 1, status: 1 });

module.exports = mongoose.model("Order", orderSchema, "orders");
