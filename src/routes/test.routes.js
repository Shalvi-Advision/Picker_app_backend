const router = require("express").Router();
const { createTestOrder } = require("../controllers/testController");

// No auth — for Postman / curl during development.
router.post("/order", createTestOrder);

module.exports = router;
