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
  manager: {
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
  admin: {
    nav_items: [
      { key: "dashboard", label: "Dashboard", icon: "dashboard" },
    ],
    order_actions: [],
    item_actions: [],
    can_reassign: false,
    can_escalate: false,
    can_view_all_stores: true,
  },
  super_admin: {
    // Web admin panel only — mobile app rejects this role at login.
    nav_items: [],
    order_actions: [],
    item_actions: [],
    can_reassign: false,
    can_escalate: false,
    can_view_all_stores: true,
  },
};

exports.login = async (req, res) => {
  try {
    const { project_code, store_code, email, password, client } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await PickerUser.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Hard RBAC by client surface:
    //   client="admin_panel" (web) → only super_admin allowed
    //   client="mobile" or unset (legacy) → super_admin forbidden, mobile roles only
    if (client === "admin_panel") {
      if (user.role !== "super_admin") {
        return res
          .status(403)
          .json({ success: false, message: "This panel is for super admins only." });
      }
    } else {
      if (user.role === "super_admin") {
        return res.status(403).json({
          success: false,
          message: "Super admins must use the web admin panel.",
        });
      }
    }

    // admin (mobile top-of-hierarchy) bypasses project/store checks like the old super_admin did.
    // picker and manager remain store-scoped.
    const requiresStoreCheck = user.role === "picker" || user.role === "manager";
    if (requiresStoreCheck) {
      if (!project_code || !store_code) {
        return res.status(400).json({
          success: false,
          message: "Project code and branch code are required",
        });
      }
      if (user.project_code !== project_code.trim()) {
        return res.status(401).json({ success: false, message: "Invalid project code" });
      }
      if (!user.store_codes.includes(store_code.trim().toUpperCase())) {
        return res.status(401).json({ success: false, message: "Invalid branch code" });
      }
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
        is_active: user.is_active,
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
