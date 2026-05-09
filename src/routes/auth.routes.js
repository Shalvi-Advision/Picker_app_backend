const router = require("express").Router();
const { login, updateFcmToken, me } = require("../controllers/authController");
const auth = require("../middleware/auth");

router.post("/login", login);
router.get("/me", auth, me);
router.put("/fcm-token", auth, updateFcmToken);

module.exports = router;
