const router = require("express").Router();
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");
const {
  getAllOrders,
  getOrderItems,
  getPickers,
  reassignOrder,
  getAllRemarks,
  createEscalation,
  resolveEscalation,
  getEscalations,
  triggerAssignment,
  getNotifications,
  markNotificationRead,
  sendOrderToSuperAdmin,
} = require("../controllers/managerController");

router.use(auth, roleGuard("store_manager"));

router.get("/orders", getAllOrders);
router.get("/orders/:orders_idorders/items", getOrderItems);
router.post("/orders/:orders_idorders/send-to-super-admin", sendOrderToSuperAdmin);
router.get("/pickers", getPickers);
router.post("/reassign", reassignOrder);
router.get("/remarks", getAllRemarks);
router.post("/escalations", createEscalation);
router.put("/escalations/:id/resolve", resolveEscalation);
router.get("/escalations", getEscalations);
router.post("/assign-order", triggerAssignment);
router.get("/notifications", getNotifications);
router.patch("/notifications/:id/read", markNotificationRead);

module.exports = router;
