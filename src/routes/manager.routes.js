const router = require("express").Router();
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");
const {
  getAllOrders,
  getPickers,
  reassignOrder,
  getAllRemarks,
  createEscalation,
  resolveEscalation,
  getEscalations,
  triggerAssignment,
} = require("../controllers/managerController");

router.use(auth, roleGuard("store_manager"));

router.get("/orders", getAllOrders);
router.get("/pickers", getPickers);
router.post("/reassign", reassignOrder);
router.get("/remarks", getAllRemarks);
router.post("/escalations", createEscalation);
router.put("/escalations/:id/resolve", resolveEscalation);
router.get("/escalations", getEscalations);
router.post("/assign-order", triggerAssignment);

module.exports = router;
