const RolePermission = require("../models/RolePermission");
const {
  CAPABILITY_KEYS,
  DEFAULT_ROLE_CAPABILITIES,
  UI_STATIC,
  PANEL_PAGES,
} = require("../constants/capabilities");

// Page caps that must NEVER be true for a project_admin, no matter what a
// per-user override says. Prevents privilege escalation into owner-only pages.
const OWNER_ONLY_PAGE_CAPS = PANEL_PAGES.filter((p) => p.owner_only).map((p) => p.cap);

// Mongoose Map fields come back as a Map; plain objects come from req.body.
// Normalize either into a plain { key: bool } object.
function toPlain(mapOrObj) {
  if (!mapOrObj) return {};
  if (mapOrObj instanceof Map) return Object.fromEntries(mapOrObj);
  if (typeof mapOrObj.toObject === "function") return mapOrObj.toObject();
  return { ...mapOrObj };
}

// All-true map over the entire catalog (used for super_admin).
function allTrue() {
  const out = {};
  for (const key of CAPABILITY_KEYS) out[key] = true;
  return out;
}

// Effective capability map for a ROLE: code defaults overlaid with any
// persisted RolePermission edits. super_admin short-circuits to all-true and
// never touches the database (so it can never be locked out).
async function getRoleCapabilities(role) {
  if (role === "super_admin") return allTrue();

  const defaults = DEFAULT_ROLE_CAPABILITIES[role] || {};
  const doc = await RolePermission.findOne({ role });
  const persisted = doc ? toPlain(doc.capabilities) : {};
  return { ...defaults, ...persisted };
}

// Effective capability map for a USER: role caps overlaid with per-user
// overrides (force-grant / force-deny).
async function getEffectiveCapabilities(user) {
  if (user.role === "super_admin") return allTrue();

  const roleCaps = await getRoleCapabilities(user.role);
  const overrides = toPlain(user.capability_overrides);
  const effective = { ...roleCaps, ...overrides };

  // Hard security floor: owner-only pages can never be granted to non-owners,
  // even via a stray capability_override.
  for (const cap of OWNER_ONLY_PAGE_CAPS) effective[cap] = false;
  return effective;
}

// Panel pages this user may access, in nav order. super_admin gets all;
// everyone else is filtered by their effective page capabilities.
function allowedPagesFor(user, caps) {
  if (user.role === "super_admin") {
    return PANEL_PAGES.map((p) => ({ key: p.key, path: p.path, label: p.label }));
  }
  return PANEL_PAGES.filter((p) => caps[p.cap] === true).map((p) => ({
    key: p.key,
    path: p.path,
    label: p.label,
  }));
}

// Single capability check used by the requireCapability middleware.
async function hasCapability(user, cap) {
  if (user.role === "super_admin") return true;
  const caps = await getEffectiveCapabilities(user);
  return caps[cap] === true;
}

// Backward-compatible ui_config for the mobile app: static nav/actions plus the
// legacy can_* flags (now computed) plus the full effective capability map under
// `capabilities`. Keeping the legacy flag names means old app builds still work.
async function buildUiConfig(user) {
  const caps = await getEffectiveCapabilities(user);
  const staticCfg = UI_STATIC[user.role] || {
    nav_items: [],
    order_actions: [],
    item_actions: [],
  };
  return {
    ...staticCfg,
    can_reassign: caps.can_reassign === true,
    can_escalate: caps.can_escalate === true,
    can_view_all_stores: caps.can_view_all_stores === true,
    capabilities: caps,
    // Web admin-panel page access (nav + route guards read this).
    allowed_pages: allowedPagesFor(user, caps),
  };
}

module.exports = {
  getRoleCapabilities,
  getEffectiveCapabilities,
  hasCapability,
  buildUiConfig,
  allowedPagesFor,
};
