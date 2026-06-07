const router = require("express").Router();
const { receiveOrder } = require("../controllers/webhookController");

// No JWT auth — authenticated via X-Webhook-Secret header inside the controller.
router.post("/order", receiveOrder);

module.exports = router;
