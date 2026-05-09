const mongoose = require("mongoose");

const syncLogSchema = new mongoose.Schema(
  {
    store_code: String,
    project_code: String,
    last_synced_at: Date,
    last_sync_status: { type: String, enum: ["success", "failed"], default: "success" },
    orders_synced: { type: Number, default: 0 },
    error_message: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SyncLog", syncLogSchema, "sync_logs");
