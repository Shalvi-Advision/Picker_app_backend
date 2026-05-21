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
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  syncOrders,
} = require("../controllers/superAdminController");
const {
  getCapabilities,
  updateRoleCapabilities,
} = require("../controllers/rbacController");

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
router.get("/users", ownerOnly, listUsers);
router.post("/users", ownerOnly, createUser);
router.patch("/users/:id", ownerOnly, updateUser);
router.delete("/users/:id", ownerOnly, deleteUser);

// Capability-based RBAC management.
router.get("/capabilities", ownerOnly, getCapabilities);
router.patch("/roles/:role/capabilities", ownerOnly, updateRoleCapabilities);

// DESTRUCTIVE manual reset: clears & replaces all orders from the source API.
router.post("/sync-orders", ownerOnly, syncOrders);

module.exports = router;
