const router = require("express").Router();
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");
const requireCapability = require("../middleware/requireCapability");
const { hasCapability } = require("../services/capabilityService");
const {
  getDashboardKpis,
  getNotificationTypes,
  getOrders,
  getOrderItems,
  getNotifications,
  markNotificationRead,
  getAllOrders,
  getOrderDelivery,
  listDeliveries,
  getRiderLocations,
  listRiders,
  listStores,
  listProjects,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  syncOrders,
  getWebhookLogs,
  backfillProjectStores,
} = require("../controllers/superAdminController");
const {
  getCapabilities,
  updateRoleCapabilities,
} = require("../controllers/rbacController");
const {
  listProjectStores,
  createProjectStore,
  updateProjectStore,
  deleteProjectStore,
  getStoreUsers,
} = require("../controllers/projectStoreController");

router.use(auth);

// Pass if the caller is one of `roles` OR holds capability `cap`. Lets a single
// route serve, say, the mobile `admin` role AND a web project_admin who has the
// matching page capability, while super_admin always passes (all-caps).
const anyOf = (roles, cap) => async (req, res, next) => {
  try {
    if (roles.includes(req.user.role)) return next();
    if (cap && (await hasCapability(req.user, cap))) return next();
    return res.status(403).json({ success: false, message: "Access denied" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Routes shared by mobile `admin`, web `super_admin`, and page-capable project_admins.
const sharedGuard = roleGuard("admin", "super_admin");
router.get("/dashboard", anyOf(["admin", "super_admin"], "can_access_dashboard"), getDashboardKpis);
router.get("/notification-types", sharedGuard, getNotificationTypes);
router.get("/orders", anyOf(["admin", "super_admin"], "can_access_orders"), getOrders);
router.get("/orders/:orders_idorders/items", anyOf(["admin", "super_admin"], "can_access_orders"), getOrderItems);
router.get("/notifications", sharedGuard, getNotifications);
router.patch("/notifications/:id/read", sharedGuard, markNotificationRead);

// Web admin panel — super_admin, plus project_admin gated by page capability.
const ownerOnly = roleGuard("super_admin");
router.get("/all-orders", requireCapability("can_access_orders"), getAllOrders);
router.get("/orders/:orders_idorders/delivery", requireCapability("can_access_orders"), getOrderDelivery);
router.get("/deliveries", requireCapability("can_access_deliveries"), listDeliveries);
router.get("/riders/locations", requireCapability("can_access_deliveries"), getRiderLocations);
router.get("/riders", requireCapability("can_access_riders"), listRiders);
router.get("/stores", requireCapability("can_access_orders"), listStores);
router.get("/projects", requireCapability("can_access_orders"), listProjects);
router.get("/users", ownerOnly, listUsers);
router.post("/users", ownerOnly, createUser);
router.patch("/users/:id", ownerOnly, updateUser);
router.delete("/users/:id", ownerOnly, deleteUser);

// Admin users (project_admin management) — super_admin only.
router.get("/admin-users", ownerOnly, listAdminUsers);
router.post("/admin-users", ownerOnly, createAdminUser);
router.patch("/admin-users/:id", ownerOnly, updateAdminUser);
router.delete("/admin-users/:id", ownerOnly, deleteAdminUser);

// Capability-based RBAC management.
router.get("/capabilities", ownerOnly, getCapabilities);
router.patch("/roles/:role/capabilities", ownerOnly, updateRoleCapabilities);

// Project → store code mappings (Projects page). project_admin writes are
// further restricted to their own project inside the controller.
router.get("/project-stores", requireCapability("can_access_projects"), listProjectStores);
router.post("/project-stores", requireCapability("can_access_projects"), createProjectStore);
router.patch("/project-stores/:id", requireCapability("can_access_projects"), updateProjectStore);
router.delete("/project-stores/:id", requireCapability("can_access_projects"), deleteProjectStore);
router.get("/project-stores/:project_code/stores/:store_code/users", requireCapability("can_access_projects"), getStoreUsers);

// DESTRUCTIVE manual reset: clears & replaces all orders from the source API.
router.post("/sync-orders", ownerOnly, syncOrders);

// Webhook call history.
router.get("/webhook-logs", ownerOnly, getWebhookLogs);

// One-time backfill: create ProjectStore mappings for all (project, store) pairs in orders.
router.post("/backfill-project-stores", ownerOnly, backfillProjectStores);

// ── App Release (APK upload & version management) ─────────────────────────────
const { upload, getCurrentRelease, setChannel, publishRelease, updateStoreConfig, deleteApk, listApks } = require("../controllers/appReleaseController");
router.get("/app-release", ownerOnly, getCurrentRelease);
router.get("/app-release/files", ownerOnly, listApks);
router.put("/app-release/channel", ownerOnly, setChannel);
router.post("/app-release", ownerOnly, upload.single("apk"), publishRelease);
router.put("/app-release/store-config", ownerOnly, updateStoreConfig);
router.delete("/app-release/:filename", ownerOnly, deleteApk);

module.exports = router;
