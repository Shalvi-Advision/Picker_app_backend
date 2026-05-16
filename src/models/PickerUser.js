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
    role: { type: String, enum: ["picker", "manager", "admin", "super_admin"], required: true },
    store_codes: { type: [String], default: [] },
    project_code: { type: String, default: "RET3163" },
    fcm_token: { type: String, default: null },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PickerUser", pickerUserSchema, "picker_users");
