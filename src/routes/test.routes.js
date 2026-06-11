const router = require("express").Router();
const { createTestOrder, diagnosePush, testPushToUser } = require("../controllers/testController");

// No auth — for Postman / curl during development.
router.post("/order", createTestOrder);
router.get("/push-diagnose", diagnosePush);
router.post("/push-user/:id", testPushToUser);

module.exports = router;
