const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const PickerUser = require("../models/PickerUser");

const UI_CONFIG = {
  picker: {
    nav_items: [
      { key: "my_orders", label: "My Orders", icon: "list" },
      { key: "scan_barcode", label: "Scan Item", icon: "barcode" },
    ],
    order_actions: ["start_picking", "reject"],
    item_actions: ["mark_picked", "mark_not_available", "mark_expired", "mark_damaged"],
    can_reassign: false,
    can_escalate: false,
    can_view_all_stores: false,
  },
  store_manager: {
    nav_items: [
      { key: "all_orders", label: "All Orders", icon: "dashboard" },
      { key: "pickers", label: "Pickers", icon: "people" },
      { key: "remarks", label: "Remarks", icon: "comment" },
      { key: "escalations", label: "Escalations", icon: "warning" },
    ],
    order_actions: ["reassign", "escalate"],
    item_actions: [],
    can_reassign: true,
    can_escalate: true,
    can_view_all_stores: true,
  },
};

exports.login = async (req, res) => {
  try {
    const { project_code, store_code, email, password } = req.body;
    if (!project_code || !store_code || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Project code, branch code, username and password are required",
      });
    }

    const user = await PickerUser.findOne({ email: email.toLowerCase() });
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (user.project_code !== project_code.trim()) {
      return res.status(401).json({ success: false, message: "Invalid project code" });
    }

    if (!user.store_codes.includes(store_code.trim().toUpperCase())) {
      return res.status(401).json({ success: false, message: "Invalid branch code" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        store_codes: user.store_codes,
        project_code: user.project_code,
      },
      ui_config: UI_CONFIG[user.role],
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateFcmToken = async (req, res) => {
  try {
    const { fcm_token } = req.body;
    await PickerUser.updateOne({ _id: req.user._id }, { fcm_token });
    res.json({ success: true, message: "FCM token updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.me = async (req, res) => {
  res.json({
    success: true,
    user: req.user,
    ui_config: UI_CONFIG[req.user.role],
  });
};
