const router = require("express").Router();
const { createTestOrder, diagnosePush, testPushToUser, listTestRiders, testAssignRider } = require("../controllers/testController");

// No auth — for Postman / curl during development.
router.post("/order", createTestOrder);
router.get("/riders", listTestRiders);
router.post("/assign-rider", testAssignRider);
router.get("/push-diagnose", diagnosePush);
router.post("/push-user/:id", testPushToUser);

module.exports = router;
