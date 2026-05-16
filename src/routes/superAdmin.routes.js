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
} = require("../controllers/superAdminController");

router.use(auth, roleGuard("super_admin"));

router.get("/dashboard", getDashboardKpis);

// Orders
router.get("/orders", getOrders); // sent-to-super-admin only (legacy)
router.get("/all-orders", getAllOrders); // every order across stores
router.get("/orders/:orders_idorders/items", getOrderItems);
router.get("/stores", listStores);

// User management (RBAC: super_admin only)
router.get("/users", listUsers);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

// Notifications
router.get("/notifications", getNotifications);
router.patch("/notifications/:id/read", markNotificationRead);

module.exports = router;
