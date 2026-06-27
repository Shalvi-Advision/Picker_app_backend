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
  getRiders,
  getRiderLocations,
  getRider,
  assignRider,
  reassignRider,
  suggestDeliveryRouteOrder,
  createDeliveryRoute,
  getDeliveryRoutes,
  getDeliveryRoute,
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
router.get("/riders", requireCapability("can_view_riders"), getRiders);
router.get("/riders/locations", requireCapability("can_view_riders"), getRiderLocations);
router.get("/riders/:id", requireCapability("can_view_riders"), getRider);
router.post(
  "/orders/:orders_idorders/assign-rider",
  requireCapability("can_assign_rider"),
  assignRider
);
router.post("/deliveries/reassign", requireCapability("can_reassign_rider"), reassignRider);
router.post(
  "/delivery-routes/suggest-order",
  requireCapability("can_create_delivery_route"),
  suggestDeliveryRouteOrder
);
router.post(
  "/delivery-routes",
  requireCapability("can_create_delivery_route"),
  createDeliveryRoute
);
router.get(
  "/delivery-routes",
  requireCapability("can_view_delivery_status"),
  getDeliveryRoutes
);
router.get(
  "/delivery-routes/:id",
  requireCapability("can_view_delivery_status"),
  getDeliveryRoute
);
router.post("/reassign", requireCapability("can_reassign"), reassignOrder);
router.get("/remarks", requireCapability("can_view_remarks"), getAllRemarks);
router.post("/escalations", requireCapability("can_escalate"), createEscalation);
router.put("/escalations/:id/resolve", requireCapability("can_resolve_escalations"), resolveEscalation);
router.get("/escalations", getEscalations);
router.post("/assign-order", requireCapability("can_assign_orders"), triggerAssignment);
router.get("/notifications", getNotifications);
router.patch("/notifications/:id/read", markNotificationRead);

module.exports = router;
