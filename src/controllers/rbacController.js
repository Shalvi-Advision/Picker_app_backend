const RolePermission = require("../models/RolePermission");
const { getRoleCapabilities } = require("../services/capabilityService");
const { CAPABILITIES, CAPABILITY_KEYS } = require("../constants/capabilities");

const EDITABLE_ROLES = ["picker", "manager", "admin"];

// GET /super-admin/capabilities
// Returns the catalog plus the current effective per-role maps (defaults merged
// with persisted edits). super_admin is reported all-true and read-only.
exports.getCapabilities = async (req, res) => {
  try {
    const roles = {};
    for (const role of EDITABLE_ROLES) {
      roles[role] = await getRoleCapabilities(role);
    }
    const superAdmin = {};
    for (const key of CAPABILITY_KEYS) superAdmin[key] = true;

    res.json({
      success: true,
      data: {
        catalog: CAPABILITIES,
        roles,
        super_admin: { capabilities: superAdmin, editable: false },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /super-admin/roles/:role/capabilities
// Body: { capabilities: { capKey: bool, ... } }  (full or partial map)
exports.updateRoleCapabilities = async (req, res) => {
  try {
    const { role } = req.params;
    if (!EDITABLE_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role is not editable (super_admin is always all-access).",
      });
    }

    const incoming = req.body.capabilities || {};
    if (typeof incoming !== "object" || Array.isArray(incoming)) {
      return res
        .status(400)
        .json({ success: false, message: "capabilities must be an object" });
    }

    // Keep only known capability keys with boolean values.
    const clean = {};
    for (const [key, val] of Object.entries(incoming)) {
      if (CAPABILITY_KEYS.has(key)) clean[key] = Boolean(val);
    }

    await RolePermission.findOneAndUpdate(
      { role },
      { capabilities: clean, updated_by: req.user._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Return the merged effective map so the panel can re-render authoritatively.
    const effective = await getRoleCapabilities(role);
    res.json({ success: true, data: { role, capabilities: effective } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
