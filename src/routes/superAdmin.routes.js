const router = require("express").Router();
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");
const {
  getDashboardKpis,
  getOrders,
  getOrderItems,
  getNotifications,
  markNotificationRead,
  getAllOrders,
  listStores,
  listProjects,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  syncOrders,
  getWebhookLogs,
} = require("../controllers/superAdminController");
const {
  getCapabilities,
  updateRoleCapabilities,
} = require("../controllers/rbacController");
const {
  listProjectStores,
  createProjectStore,
  deleteProjectStore,
  getStoreUsers,
} = require("../controllers/projectStoreController");

router.use(auth);

// Routes shared by mobile `admin` and web `super_admin`.
// These show only orders that managers have explicitly escalated upward.
const sharedGuard = roleGuard("admin", "super_admin");
router.get("/dashboard", sharedGuard, getDashboardKpis);
router.get("/orders", sharedGuard, getOrders);
router.get("/orders/:orders_idorders/items", sharedGuard, getOrderItems);
router.get("/notifications", sharedGuard, getNotifications);
router.patch("/notifications/:id/read", sharedGuard, markNotificationRead);

// Web admin panel only — Retail Magic super_admin.
const ownerOnly = roleGuard("super_admin");
router.get("/all-orders", ownerOnly, getAllOrders);
router.get("/stores", ownerOnly, listStores);
router.get("/projects", ownerOnly, listProjects);
router.get("/users", ownerOnly, listUsers);
router.post("/users", ownerOnly, createUser);
router.patch("/users/:id", ownerOnly, updateUser);
router.delete("/users/:id", ownerOnly, deleteUser);

// Capability-based RBAC management.
router.get("/capabilities", ownerOnly, getCapabilities);
router.patch("/roles/:role/capabilities", ownerOnly, updateRoleCapabilities);

// Project → store code mappings.
router.get("/project-stores", ownerOnly, listProjectStores);
router.post("/project-stores", ownerOnly, createProjectStore);
router.delete("/project-stores/:id", ownerOnly, deleteProjectStore);
router.get("/project-stores/:project_code/stores/:store_code/users", ownerOnly, getStoreUsers);

// DESTRUCTIVE manual reset: clears & replaces all orders from the source API.
router.post("/sync-orders", ownerOnly, syncOrders);

// Webhook call history.
router.get("/webhook-logs", ownerOnly, getWebhookLogs);

module.exports = router;
