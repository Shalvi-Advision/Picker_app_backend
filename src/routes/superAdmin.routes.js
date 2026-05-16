const router = require("express").Router();
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");
const {
  getDashboardKpis,
  getOrders,
  getOrderItems,
  getNotifications,
  markNotificationRead,
} = require("../controllers/superAdminController");

router.use(auth, roleGuard("super_admin"));

router.get("/dashboard", getDashboardKpis);
router.get("/orders", getOrders);
router.get("/orders/:orders_idorders/items", getOrderItems);
router.get("/notifications", getNotifications);
router.patch("/notifications/:id/read", markNotificationRead);

module.exports = router;
