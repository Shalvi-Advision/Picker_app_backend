const router = require("express").Router();
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");
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

// Routes shared by mobile `admin` and web `super_admin`.
// These show only orders that managers have explicitly escalated upward.
const sharedGuard = roleGuard("admin", "super_admin");
router.get("/dashboard", sharedGuard, getDashboardKpis);
router.get("/notification-types", sharedGuard, getNotificationTypes);
router.get("/orders", sharedGuard, getOrders);
router.get("/orders/:orders_idorders/items", sharedGuard, getOrderItems);
router.get("/notifications", sharedGuard, getNotifications);
router.patch("/notifications/:id/read", sharedGuard, markNotificationRead);

// Web admin panel only — Retail Magic super_admin.
const ownerOnly = roleGuard("super_admin");
router.get("/all-orders", ownerOnly, getAllOrders);
router.get("/orders/:orders_idorders/delivery", ownerOnly, getOrderDelivery);
router.get("/deliveries", ownerOnly, listDeliveries);
router.get("/riders/locations", ownerOnly, getRiderLocations);
router.get("/riders", ownerOnly, listRiders);
router.get("/stores", ownerOnly, listStores);
router.get("/projects", ownerOnly, listProjects);
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

// Project → store code mappings.
router.get("/project-stores", ownerOnly, listProjectStores);
router.post("/project-stores", ownerOnly, createProjectStore);
router.patch("/project-stores/:id", ownerOnly, updateProjectStore);
router.delete("/project-stores/:id", ownerOnly, deleteProjectStore);
router.get("/project-stores/:project_code/stores/:store_code/users", ownerOnly, getStoreUsers);

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
