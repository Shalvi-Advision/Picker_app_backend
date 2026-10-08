const mongoose = require("mongoose");

const projectStoreSchema = new mongoose.Schema(
  {
    project_code: { type: String, required: true, uppercase: true, trim: true },
    store_code:   { type: String, required: true, uppercase: true, trim: true },
    latitude:     { type: String, default: null },
    longitude:    { type: String, default: null },
    address:      { type: String, default: null },
    // Where to POST status updates for orders from this (project, store)
    // back to the upstream e-commerce system that sent them — set by the
    // caller on each order webhook (see webhookController.receiveOrder).
    // Null for every project that doesn't send these, so existing rows
    // (e.g. the legacy RET3163/Patel integration) are unaffected and
    // upstreamStatusService falls back to the global RIDER_DELIVERED_API_URL.
    upstream_webhook_url:    { type: String, default: null },
    upstream_webhook_secret: { type: String, default: null },
  },
  { timestamps: true }
);

// Each (project_code, store_code) pair must be unique.
projectStoreSchema.index({ project_code: 1, store_code: 1 }, { unique: true });

module.exports = mongoose.model("ProjectStore", projectStoreSchema, "project_stores");
