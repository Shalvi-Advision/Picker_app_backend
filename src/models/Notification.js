const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser", required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, default: "info" }, // e.g. picker_availability, order_assigned, escalation
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema, "notifications");
