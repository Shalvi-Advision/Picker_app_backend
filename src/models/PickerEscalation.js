const mongoose = require("mongoose");

const pickerEscalationSchema = new mongoose.Schema(
  {
    assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: "PickerAssignment", required: true },
    orders_idorders: { type: Number, required: true },
    item_status_id: { type: mongoose.Schema.Types.ObjectId, ref: "PickerItemStatus", default: null },
    store_code: { type: String, default: null },
    item_name: { type: String, default: null },
    raised_by: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser", required: true },
    remark_summary: { type: String, required: true },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
    resolution_note: { type: String, default: null },
    resolved_at: { type: Date, default: null },
  },
  { timestamps: true }
);

pickerEscalationSchema.index({ assignment_id: 1, status: 1 });
pickerEscalationSchema.index({ raised_by: 1 });
pickerEscalationSchema.index({ store_code: 1, status: 1 });

module.exports = mongoose.model("PickerEscalation", pickerEscalationSchema, "picker_escalations");
