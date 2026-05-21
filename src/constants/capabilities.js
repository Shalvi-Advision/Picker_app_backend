// Central capability catalog for capability-based RBAC.
//
// A "capability" is a named permission flag. The super_admin can edit the
// per-role defaults (stored in the RolePermission collection) and per-user
// overrides (PickerUser.capability_overrides). The values here are the code
// fallbacks used when nothing is persisted — they mirror the original
// hardcoded UI_CONFIG so behavior is identical out of the box.
//
// super_admin is intentionally NOT represented here: it is always-all and
// non-editable (handled in capabilityService).

const ROLES = ["picker", "manager", "admin"];

// Ordered catalog. `applies_to` controls which roles the admin panel offers the
// toggle for. `kind` documents how it is enforced: "write" / "read" => backend
// 403 guard; "ui" => client-only (no route to guard).
const CAPABILITIES = [
  // Picking
  { key: "can_start_picking", label: "Start picking", group: "Picking", kind: "write", applies_to: ["picker"] },
  { key: "can_pick_items", label: "Pick / update item status", group: "Picking", kind: "write", applies_to: ["picker"] },
  { key: "can_complete_orders", label: "Complete order", group: "Picking", kind: "write", applies_to: ["picker"] },
  { key: "can_reject_orders", label: "Reject order", group: "Picking", kind: "write", applies_to: ["picker"] },
  { key: "can_set_availability", label: "Toggle own availability", group: "Picking", kind: "write", applies_to: ["picker"] },

  // Order management (manager)
  { key: "can_reassign", label: "Reassign to another picker", group: "Order management", kind: "write", applies_to: ["manager"] },
  { key: "can_assign_orders", label: "Trigger round-robin assign", group: "Order management", kind: "write", applies_to: ["manager"] },
  { key: "can_escalate", label: "Escalate order", group: "Order management", kind: "write", applies_to: ["manager"] },
  { key: "can_resolve_escalations", label: "Resolve escalations", group: "Order management", kind: "write", applies_to: ["manager"] },
  { key: "can_send_to_super_admin", label: "Forward completed order to admin", group: "Order management", kind: "write", applies_to: ["manager"] },
  { key: "can_print_orders", label: "Print / export order PDF", group: "Order management", kind: "ui", applies_to: ["manager"] },

  // Visibility
  { key: "can_view_orders", label: "View orders list", group: "Visibility", kind: "read", applies_to: ["picker", "manager"] },
  { key: "can_manage_pickers", label: "View / manage pickers", group: "Visibility", kind: "read", applies_to: ["manager"] },
  { key: "can_view_remarks", label: "View picker remarks", group: "Visibility", kind: "read", applies_to: ["manager"] },
  { key: "can_view_all_stores", label: "See all stores", group: "Visibility", kind: "ui", applies_to: ["manager", "admin"] },
];

const CAPABILITY_KEYS = new Set(CAPABILITIES.map((c) => c.key));

// Per-role default capability maps. Ported from the original UI_CONFIG can_*
// flags, extended with the new capabilities at their natural defaults.
const DEFAULT_ROLE_CAPABILITIES = {
  picker: {
    can_start_picking: true,
    can_pick_items: true,
    can_complete_orders: true,
    can_reject_orders: true,
    can_set_availability: true,
    can_view_orders: true,
    // manager-only caps explicitly false
    can_reassign: false,
    can_assign_orders: false,
    can_escalate: false,
    can_resolve_escalations: false,
    can_send_to_super_admin: false,
    can_print_orders: false,
    can_manage_pickers: false,
    can_view_remarks: false,
    can_view_all_stores: false,
  },
  manager: {
    can_reassign: true,
    can_assign_orders: true,
    can_escalate: true,
    can_resolve_escalations: true,
    can_send_to_super_admin: true,
    can_print_orders: true,
    can_view_orders: true,
    can_manage_pickers: true,
    can_view_remarks: true,
    can_view_all_stores: true,
    // picker-only caps explicitly false
    can_start_picking: false,
    can_pick_items: false,
    can_complete_orders: false,
    can_reject_orders: false,
    can_set_availability: false,
  },
  admin: {
    // Mobile top-of-hierarchy: read-only dashboard view across stores.
    can_view_orders: true,
    can_view_all_stores: true,
    can_start_picking: false,
    can_pick_items: false,
    can_complete_orders: false,
    can_reject_orders: false,
    can_set_availability: false,
    can_reassign: false,
    can_assign_orders: false,
    can_escalate: false,
    can_resolve_escalations: false,
    can_send_to_super_admin: false,
    can_print_orders: false,
    can_manage_pickers: false,
    can_view_remarks: false,
  },
};

// Static (non-capability) UI scaffolding moved out of authController's UI_CONFIG.
// nav_items / *_actions are not editable; only the can_* flags are dynamic.
const UI_STATIC = {
  picker: {
    nav_items: [
      { key: "my_orders", label: "My Orders", icon: "list" },
      { key: "scan_barcode", label: "Scan Item", icon: "barcode" },
    ],
    order_actions: ["start_picking", "reject"],
    item_actions: ["mark_picked", "mark_not_available", "mark_expired", "mark_damaged"],
  },
  manager: {
    nav_items: [
      { key: "all_orders", label: "All Orders", icon: "dashboard" },
      { key: "pickers", label: "Pickers", icon: "people" },
      { key: "remarks", label: "Remarks", icon: "comment" },
      { key: "escalations", label: "Escalations", icon: "warning" },
    ],
    order_actions: ["reassign", "escalate"],
    item_actions: [],
  },
  admin: {
    nav_items: [{ key: "dashboard", label: "Dashboard", icon: "dashboard" }],
    order_actions: [],
    item_actions: [],
  },
  super_admin: {
    nav_items: [],
    order_actions: [],
    item_actions: [],
  },
};

module.exports = {
  ROLES,
  CAPABILITIES,
  CAPABILITY_KEYS,
  DEFAULT_ROLE_CAPABILITIES,
  UI_STATIC,
};
