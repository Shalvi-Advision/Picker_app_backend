const router = require("express").Router();
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");
const {
  getMyOrders,
  getOrderItems,
  startPicking,
  updateItemStatus,
  completeOrder,
  rejectOrder,
  setMyAvailability,
} = require("../controllers/pickerController");

router.use(auth, roleGuard("picker"));

router.get("/orders", getMyOrders);
router.get("/orders/:orders_idorders/items", getOrderItems);
router.post("/orders/:orders_idorders/start", startPicking);
router.put("/assignments/:assignment_id/items/:order_item_id", updateItemStatus);
router.post("/orders/:orders_idorders/complete", completeOrder);
router.post("/orders/:orders_idorders/reject", rejectOrder);
router.patch("/me/availability", setMyAvailability);

module.exports = router;
