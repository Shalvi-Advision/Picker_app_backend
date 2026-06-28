const mongoose = require("mongoose");

const EVENT_TYPES = ["order_receive", "order_cancel", "order_assign_rider"];

const webhookLogSchema = new mongoose.Schema(
  {
    event_type: {
      type: String,
      enum: EVENT_TYPES,
      default: "order_receive",
    },
    orders_idorders: { type: Number, default: null },
    store_code: { type: String, default: null },
    project_code: { type: String, default: null },
    items_count: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["success", "skipped", "auth_failed", "validation_failed", "error"],
      required: true,
    },
    assigned: { type: Boolean, default: null },
    assign_error: { type: String, default: null },
    error_message: { type: String, default: null },
    caller_ip: { type: String, default: null },
    /** Cancel / assign-rider extras (reason, rider name, round-robin, counts, …) */
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

webhookLogSchema.index({ createdAt: -1 });
webhookLogSchema.index({ orders_idorders: 1 });
webhookLogSchema.index({ event_type: 1, createdAt: -1 });

module.exports = mongoose.model("WebhookLog", webhookLogSchema, "webhook_logs");
module.exports.EVENT_TYPES = EVENT_TYPES;
