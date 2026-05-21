const router = require("express").Router();
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");
const requireCapability = require("../middleware/requireCapability");
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

router.use(auth, roleGuard("manager"));

router.get("/orders", requireCapability("can_view_orders"), getAllOrders);
router.get("/orders/:orders_idorders/items", getOrderItems);
router.post(
  "/orders/:orders_idorders/send-to-super-admin",
  requireCapability("can_send_to_super_admin"),
  sendOrderToSuperAdmin
);
router.get("/pickers", requireCapability("can_manage_pickers"), getPickers);
router.post("/reassign", requireCapability("can_reassign"), reassignOrder);
router.get("/remarks", requireCapability("can_view_remarks"), getAllRemarks);
router.post("/escalations", requireCapability("can_escalate"), createEscalation);
router.put("/escalations/:id/resolve", requireCapability("can_resolve_escalations"), resolveEscalation);
router.get("/escalations", getEscalations);
router.post("/assign-order", requireCapability("can_assign_orders"), triggerAssignment);
router.get("/notifications", getNotifications);
router.patch("/notifications/:id/read", markNotificationRead);

module.exports = router;
