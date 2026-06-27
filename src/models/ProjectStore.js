const mongoose = require("mongoose");

const projectStoreSchema = new mongoose.Schema(
  {
    project_code: { type: String, required: true, uppercase: true, trim: true },
    store_code:   { type: String, required: true, uppercase: true, trim: true },
    latitude:     { type: String, default: null },
    longitude:    { type: String, default: null },
    address:      { type: String, default: null },
  },
  { timestamps: true }
);

// Each (project_code, store_code) pair must be unique.
projectStoreSchema.index({ project_code: 1, store_code: 1 }, { unique: true });

module.exports = mongoose.model("ProjectStore", projectStoreSchema, "project_stores");
