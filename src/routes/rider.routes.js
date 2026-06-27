const router = require("express").Router();
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");
const requireCapability = require("../middleware/requireCapability");
const {
  podUpload,
  uploadPodPhoto,
  getMyDeliveries,
  getDeliveryDetail,
  startDelivery,
  completeDelivery,
  failDelivery,
  setMyAvailability,
  getMyNotifications,
  markMyNotificationRead,
  getActiveRoute,
  getRoute,
} = require("../controllers/riderController");

router.use(auth, roleGuard("rider"));

router.get("/deliveries", requireCapability("can_view_deliveries"), getMyDeliveries);
router.get("/routes/active", requireCapability("can_view_deliveries"), getActiveRoute);
router.get("/routes/:id", requireCapability("can_view_deliveries"), getRoute);
router.get("/deliveries/:orders_idorders", requireCapability("can_view_deliveries"), getDeliveryDetail);
router.post("/deliveries/:id/start", requireCapability("can_start_delivery"), startDelivery);
router.post("/deliveries/:id/complete", requireCapability("can_complete_delivery"), completeDelivery);
router.post("/deliveries/:id/fail", requireCapability("can_fail_delivery"), failDelivery);
router.post(
  "/upload-pod",
  requireCapability("can_upload_pod"),
  podUpload.single("photo"),
  uploadPodPhoto
);
router.patch("/me/availability", requireCapability("can_set_rider_availability"), setMyAvailability);
router.get("/notifications", getMyNotifications);
router.patch("/notifications/:id/read", markMyNotificationRead);

module.exports = router;
