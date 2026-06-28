const mongoose = require("mongoose");

const pickerAssignmentSchema = new mongoose.Schema(
  {
    orders_idorders: { type: Number, required: true },
    store_code: { type: String, required: true },
    project_code: { type: String, required: true },
    assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser", required: true },
    assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser", default: null },
    assignment_round: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["assigned", "in_progress", "completed", "rejected", "reassigned", "cancelled"],
      default: "assigned",
    },
    rejected_reason: { type: String, default: null },
    reassigned_from: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser", default: null },
    reassigned_at: { type: Date, default: null },
    assigned_at: { type: Date, default: Date.now },
    completed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

pickerAssignmentSchema.index({ orders_idorders: 1 });
pickerAssignmentSchema.index({ assigned_to: 1, status: 1 });
pickerAssignmentSchema.index({ store_code: 1, status: 1 });

module.exports = mongoose.model("PickerAssignment", pickerAssignmentSchema, "picker_assignments");
