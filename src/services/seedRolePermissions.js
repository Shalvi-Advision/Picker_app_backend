const RolePermission = require("../models/RolePermission");
const { DEFAULT_ROLE_CAPABILITIES } = require("../constants/capabilities");

// Idempotent: seed any role missing from role_permissions with code defaults.
// Never overwrites existing (edited) docs.
const seedRolePermissions = async () => {
  try {
    for (const [role, capabilities] of Object.entries(DEFAULT_ROLE_CAPABILITIES)) {
      const exists = await RolePermission.findOne({ role });
      if (!exists) {
        await RolePermission.create({ role, capabilities });
        console.log(`[rbac] seeded default permissions for role: ${role}`);
      }
    }
  } catch (err) {
    console.error("[rbac] seedRolePermissions failed:", err.message);
  }
};

module.exports = seedRolePermissions;
