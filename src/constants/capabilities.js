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

const ROLES = ["picker", "manager", "admin", "rider"];

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

  // Delivery (rider)
  { key: "can_view_deliveries", label: "View my deliveries", group: "Delivery", kind: "read", applies_to: ["rider"] },
  { key: "can_start_delivery", label: "Start delivery", group: "Delivery", kind: "write", applies_to: ["rider"] },
  { key: "can_complete_delivery", label: "Complete delivery", group: "Delivery", kind: "write", applies_to: ["rider"] },
  { key: "can_upload_pod", label: "Upload proof of delivery", group: "Delivery", kind: "write", applies_to: ["rider"] },
  { key: "can_fail_delivery", label: "Mark delivery failed", group: "Delivery", kind: "write", applies_to: ["rider"] },
  { key: "can_set_rider_availability", label: "Toggle rider online/offline", group: "Delivery", kind: "write", applies_to: ["rider"] },

  // Order management (manager)
  { key: "can_reassign", label: "Reassign to another picker", group: "Order management", kind: "write", applies_to: ["manager"] },
  { key: "can_assign_orders", label: "Trigger round-robin assign", group: "Order management", kind: "write", applies_to: ["manager"] },
  { key: "can_escalate", label: "Escalate order", group: "Order management", kind: "write", applies_to: ["manager"] },
  { key: "can_resolve_escalations", label: "Resolve escalations", group: "Order management", kind: "write", applies_to: ["manager"] },
  { key: "can_send_to_super_admin", label: "Forward completed order to admin", group: "Order management", kind: "write", applies_to: ["manager"] },
  { key: "can_print_orders", label: "Print / export order PDF", group: "Order management", kind: "ui", applies_to: ["manager"] },

  // Delivery management (manager)
  { key: "can_view_riders", label: "View riders", group: "Delivery management", kind: "read", applies_to: ["manager"] },
  { key: "can_assign_rider", label: "Assign rider to order", group: "Delivery management", kind: "write", applies_to: ["manager"] },
  { key: "can_reassign_rider", label: "Reassign delivery", group: "Delivery management", kind: "write", applies_to: ["manager"] },
  { key: "can_view_delivery_status", label: "View delivery status on orders", group: "Delivery management", kind: "read", applies_to: ["manager"] },
  { key: "can_create_delivery_route", label: "Create batched delivery routes", group: "Delivery management", kind: "write", applies_to: ["manager"] },

  // Visibility
  { key: "can_view_orders", label: "View orders list", group: "Visibility", kind: "read", applies_to: ["picker", "manager", "admin"] },
  { key: "can_manage_pickers", label: "View / manage pickers", group: "Visibility", kind: "read", applies_to: ["manager"] },
  { key: "can_view_remarks", label: "View picker remarks", group: "Visibility", kind: "read", applies_to: ["manager"] },
  { key: "can_view_all_stores", label: "See all stores", group: "Visibility", kind: "ui", applies_to: ["manager", "admin"] },
  { key: "can_view_deliveries_admin", label: "View deliveries (cross-store)", group: "Visibility", kind: "read", applies_to: ["admin"] },

  // Admin-panel page access (web). One capability per sidebar page. Gated for
  // project_admin (super_admin always has all). "owner_only: true" pages are
  // never grantable to project_admin regardless of toggles.
  { key: "can_access_dashboard", label: "Dashboard page", group: "Panel access", kind: "page", applies_to: ["project_admin"] },
  { key: "can_access_orders", label: "Orders page", group: "Panel access", kind: "page", applies_to: ["project_admin"] },
  { key: "can_access_deliveries", label: "Deliveries page", group: "Panel access", kind: "page", applies_to: ["project_admin"] },
  { key: "can_access_riders", label: "Riders page", group: "Panel access", kind: "page", applies_to: ["project_admin"] },
  { key: "can_access_projects", label: "Projects page", group: "Panel access", kind: "page", applies_to: ["project_admin"] },
  { key: "can_access_users", label: "Users page", group: "Panel access", kind: "page", applies_to: [], owner_only: true },
  { key: "can_access_admin_users", label: "Admin Users page", group: "Panel access", kind: "page", applies_to: [], owner_only: true },
  { key: "can_access_roles", label: "Roles page", group: "Panel access", kind: "page", applies_to: [], owner_only: true },
  { key: "can_access_webhook_logs", label: "Webhook Logs page", group: "Panel access", kind: "page", applies_to: [], owner_only: true },
  { key: "can_access_app_release", label: "App Release page", group: "Panel access", kind: "page", applies_to: [], owner_only: true },
];

// Sidebar pages in nav order, with the capability that unlocks each and its
// frontend route. Single source of truth for both nav rendering and route
// guards. owner_only pages are super_admin-exclusive.
const PANEL_PAGES = [
  { key: "dashboard", path: "/dashboard", label: "Dashboard", cap: "can_access_dashboard", owner_only: false },
  { key: "users", path: "/users", label: "Users", cap: "can_access_users", owner_only: true },
  { key: "admin_users", path: "/admin-users", label: "Admin Users", cap: "can_access_admin_users", owner_only: true },
  { key: "roles", path: "/roles", label: "Roles", cap: "can_access_roles", owner_only: true },
  { key: "riders", path: "/riders", label: "Riders", cap: "can_access_riders", owner_only: false },
  { key: "deliveries", path: "/deliveries", label: "Deliveries", cap: "can_access_deliveries", owner_only: false },
  { key: "orders", path: "/orders", label: "Orders", cap: "can_access_orders", owner_only: false },
  { key: "projects", path: "/projects", label: "Projects", cap: "can_access_projects", owner_only: false },
  { key: "webhook_logs", path: "/webhook-logs", label: "Webhook Logs", cap: "can_access_webhook_logs", owner_only: true },
  { key: "app_release", path: "/app-release", label: "App Release", cap: "can_access_app_release", owner_only: true },
];

// Page caps a project_admin MAY be granted (everything not owner_only).
const PROJECT_ADMIN_PAGE_CAPS = PANEL_PAGES.filter((p) => !p.owner_only).map((p) => p.cap);

const CAPABILITY_KEYS = new Set(CAPABILITIES.map((c) => c.key));

const FALSE_DELIVERY_MANAGER = {
  can_view_riders: false,
  can_assign_rider: false,
  can_reassign_rider: false,
  can_view_delivery_status: false,
  can_create_delivery_route: false,
};

const FALSE_DELIVERY_RIDER = {
  can_view_deliveries: false,
  can_start_delivery: false,
  can_complete_delivery: false,
  can_upload_pod: false,
  can_fail_delivery: false,
  can_set_rider_availability: false,
};

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
    can_reassign: false,
    can_assign_orders: false,
    can_escalate: false,
    can_resolve_escalations: false,
    can_send_to_super_admin: false,
    can_print_orders: false,
    can_manage_pickers: false,
    can_view_remarks: false,
    can_view_all_stores: false,
    can_view_deliveries_admin: false,
    ...FALSE_DELIVERY_MANAGER,
    ...FALSE_DELIVERY_RIDER,
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
    can_view_riders: true,
    can_assign_rider: true,
    can_reassign_rider: true,
    can_view_delivery_status: true,
    can_create_delivery_route: true,
    can_view_deliveries_admin: false,
    can_start_picking: false,
    can_pick_items: false,
    can_complete_orders: false,
    can_reject_orders: false,
    can_set_availability: false,
    ...FALSE_DELIVERY_RIDER,
  },
  admin: {
    can_view_orders: true,
    can_view_all_stores: true,
    can_view_deliveries_admin: true,
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
    ...FALSE_DELIVERY_MANAGER,
    ...FALSE_DELIVERY_RIDER,
  },
  rider: {
    can_view_deliveries: true,
    can_start_delivery: true,
    can_complete_delivery: true,
    can_upload_pod: true,
    can_fail_delivery: true,
    can_set_rider_availability: true,
    can_view_orders: false,
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
    can_view_all_stores: false,
    can_view_deliveries_admin: false,
    ...FALSE_DELIVERY_MANAGER,
  },
  // Web admin-panel role, scoped to one project_code (all its stores). Defaults
  // grant the non-owner pages; the super admin can toggle each per user via
  // capability_overrides. owner_only pages are force-denied below.
  project_admin: {
    can_access_dashboard: true,
    can_access_orders: true,
    can_access_deliveries: true,
    can_access_riders: true,
    can_access_projects: true,
    // Owner-only pages: never on for project_admin.
    can_access_users: false,
    can_access_roles: false,
    can_access_webhook_logs: false,
    can_access_app_release: false,
    // Data visibility within the project.
    can_view_orders: true,
    can_view_delivery_status: true,
    can_view_riders: true,
    can_view_all_stores: false, // scoped to their project's stores, not global
    can_view_deliveries_admin: true,
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
      { key: "riders", label: "Riders", icon: "delivery" },
      { key: "remarks", label: "Remarks", icon: "comment" },
      { key: "escalations", label: "Escalations", icon: "warning" },
    ],
    order_actions: ["reassign", "escalate", "assign_rider"],
    item_actions: [],
  },
  rider: {
    nav_items: [{ key: "my_deliveries", label: "My Deliveries", icon: "delivery" }],
    order_actions: ["start_delivery", "complete_delivery", "fail_delivery"],
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
  PANEL_PAGES,
  PROJECT_ADMIN_PAGE_CAPS,
};
