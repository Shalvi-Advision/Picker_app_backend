const router = require("express").Router();
const { receiveOrder, cancelOrder, assignRider } = require("../controllers/webhookController");

// No JWT auth — authenticated via X-Webhook-Secret header inside the controller.
router.post("/order", receiveOrder);
router.post("/order/cancel", cancelOrder);
router.post("/order/assign-rider", assignRider);

module.exports = router;
