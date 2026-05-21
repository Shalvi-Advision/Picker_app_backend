const RolePermission = require("../models/RolePermission");
const { DEFAULT_ROLE_CAPABILITIES } = require("../constants/capabilities");

// Idempotent: if the role_permissions collection is empty, seed the three
// editable roles with their code-default capability maps so the admin panel
// shows real toggles immediately. Never overwrites existing (edited) docs.
const seedRolePermissions = async () => {
  try {
    const count = await RolePermission.estimatedDocumentCount();
    if (count > 0) return;

    const docs = Object.entries(DEFAULT_ROLE_CAPABILITIES).map(([role, capabilities]) => ({
      role,
      capabilities,
    }));
    await RolePermission.insertMany(docs, { ordered: false });
    console.log(`[rbac] seeded ${docs.length} default role permission docs`);
  } catch (err) {
    // Non-fatal: missing docs fall back to code defaults anyway.
    console.error("[rbac] seedRolePermissions failed:", err.message);
  }
};

module.exports = seedRolePermissions;
