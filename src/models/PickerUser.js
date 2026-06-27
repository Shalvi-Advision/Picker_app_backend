const mongoose = require("mongoose");

const pickerUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    // Role hierarchy:
    //   picker / manager / admin = mobile app users (store-scoped)
    //   super_admin = Retail Magic owner, web admin panel only
    role: {
      type: String,
      enum: ["picker", "manager", "admin", "rider", "super_admin"],
      required: true,
    },
    rider_availability: {
      type: String,
      enum: ["online", "offline"],
      default: "online",
    },
    store_codes: { type: [String], default: [] },
    project_code: { type: String, default: "" },
    fcm_token: { type: String, default: null },
    is_active: { type: Boolean, default: true },
    // Per-user capability overrides: capKey -> true (force-grant) / false
    // (force-deny). Absent keys fall back to the role default. Does NOT gate
    // login — permissions only.
    capability_overrides: { type: Map, of: Boolean, default: {} },
    last_location: {
      latitude: { type: String, default: null },
      longitude: { type: String, default: null },
      updated_at: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PickerUser", pickerUserSchema, "picker_users");
