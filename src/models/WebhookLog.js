const mongoose = require("mongoose");

const webhookLogSchema = new mongoose.Schema(
  {
    orders_idorders: { type: Number, default: null },
    store_code:      { type: String, default: null },
    project_code:    { type: String, default: null },
    items_count:     { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["success", "skipped", "auth_failed", "validation_failed", "error"],
      required: true,
    },
    assigned:        { type: Boolean, default: null },
    assign_error:    { type: String, default: null },
    error_message:   { type: String, default: null },
    caller_ip:       { type: String, default: null },
  },
  { timestamps: true }
);

webhookLogSchema.index({ createdAt: -1 });
webhookLogSchema.index({ orders_idorders: 1 });

module.exports = mongoose.model("WebhookLog", webhookLogSchema, "webhook_logs");
