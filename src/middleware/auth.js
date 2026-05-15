const jwt = require("jsonwebtoken");
const PickerUser = require("../models/PickerUser");

const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await PickerUser.findById(decoded.id).select("-password");
    // `is_active` is the round-robin availability flag (picker self-toggles it /
    // manager toggles it). Inactive users can still authenticate so they can
    // flip themselves back on. Round-robin gates assignment separately.
    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

module.exports = auth;
