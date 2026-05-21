const { hasCapability } = require("../services/capabilityService");

// Capability gate. Runs AFTER `auth` (needs req.user) and AFTER `roleGuard`
// (role first, capability second). Returns 403 if the user's effective
// capability map does not grant `cap`.
const requireCapability = (cap) => async (req, res, next) => {
  try {
    if (await hasCapability(req.user, cap)) return next();
    return res
      .status(403)
      .json({ success: false, message: "Capability not permitted" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = requireCapability;
