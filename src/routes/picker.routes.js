const router = require("express").Router();
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");
const requireCapability = require("../middleware/requireCapability");
const {
  getMyOrders,
  getOrderItems,
  startPicking,
  updateItemStatus,
  completeOrder,
  rejectOrder,
  setMyAvailability,
  getMyNotifications,
  markMyNotificationRead,
} = require("../controllers/pickerController");

router.use(auth, roleGuard("picker"));

router.get("/orders", requireCapability("can_view_orders"), getMyOrders);
router.get("/orders/:orders_idorders/items", getOrderItems);
router.post("/orders/:orders_idorders/start", requireCapability("can_start_picking"), startPicking);
router.put(
  "/assignments/:assignment_id/items/:order_item_id",
  requireCapability("can_pick_items"),
  updateItemStatus
);
router.post("/orders/:orders_idorders/complete", requireCapability("can_complete_orders"), completeOrder);
router.post("/orders/:orders_idorders/reject", requireCapability("can_reject_orders"), rejectOrder);
router.patch("/me/availability", requireCapability("can_set_availability"), setMyAvailability);
router.get("/notifications", getMyNotifications);
router.patch("/notifications/:id/read", markMyNotificationRead);

module.exports = router;
