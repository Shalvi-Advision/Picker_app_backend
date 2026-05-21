const mongoose = require("mongoose");

// Editable per-role capability map. Absence of a doc (or a key) means "use the
// code default" from src/constants/capabilities.js. Stored as a Map of bool so
// that adding new catalog keys later does not silently freeze existing roles.
//
// super_admin is deliberately excluded from the enum: it is always-all and
// never persisted here.
const rolePermissionSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["picker", "manager", "admin"],
      unique: true,
      required: true,
    },
    capabilities: { type: Map, of: Boolean, default: {} },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "PickerUser", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RolePermission", rolePermissionSchema, "role_permissions");
