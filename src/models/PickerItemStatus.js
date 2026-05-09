const mongoose = require("mongoose");

const pickerItemStatusSchema = new mongoose.Schema(
  {
    assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: "PickerAssignment", required: true },
    order_item_id: { type: String, required: true },
    orders_idorders: { type: Number, required: true },
    p_code: String,
    barcode: String,
    item_name: String,
    ordered_quantity: Number,
    picked_status: {
      type: String,
      enum: ["pending", "picked", "not_available", "expired", "damaged"],
      default: "pending",
    },
    picked_quantity: { type: Number, default: 0 },
    remark: { type: String, default: null },
    photo_url: { type: String, default: null },
    picked_by: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser" },
    picked_at: { type: Date, default: null },
  },
  { timestamps: true }
);

pickerItemStatusSchema.index({ assignment_id: 1 });
pickerItemStatusSchema.index({ orders_idorders: 1 });

module.exports = mongoose.model("PickerItemStatus", pickerItemStatusSchema, "picker_item_status");
