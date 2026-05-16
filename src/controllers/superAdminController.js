const bcrypt = require("bcryptjs");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const PickerAssignment = require("../models/PickerAssignment");
const PickerItemStatus = require("../models/PickerItemStatus");
const Notification = require("../models/Notification");
const PickerUser = require("../models/PickerUser");

const ALLOWED_ROLES = ["picker", "store_manager", "super_admin"];

// Only orders that have been explicitly sent up by a manager.
const SENT_FILTER = { sent_to_super_admin: true };

exports.getDashboardKpis = async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, thisMonth, agg] = await Promise.all([
      Order.countDocuments(SENT_FILTER),
      Order.countDocuments({ ...SENT_FILTER, sent_to_super_admin_at: { $gte: monthStart } }),
      Order.aggregate([
        { $match: SENT_FILTER },
        {
          $group: {
            _id: null,
            total_amount: { $sum: "$total_amount" },
            stores: { $addToSet: "$store_code" },
          },
        },
      ]),
    ]);

    const totalAmount = agg[0]?.total_amount || 0;
    const storesCovered = agg[0]?.stores?.length || 0;

    res.json({
      success: true,
      data: {
        total_sent: total,
        sent_this_month: thisMonth,
        total_amount: totalAmount,
        stores_covered: storesCovered,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { store_code } = req.query;
    const filter = { ...SENT_FILTER };
    if (store_code) filter.store_code = store_code;

    const orders = await Order.find(filter).sort({ sent_to_super_admin_at: -1 });

    const orderIds = orders.map((o) => o.orders_idorders);
    const assignments = await PickerAssignment.find({ orders_idorders: { $in: orderIds } })
      .populate("assigned_to", "name email phone")
      .sort({ assigned_at: -1 });

    const assignmentsMap = {};
    for (const a of assignments) {
      if (!assignmentsMap[a.orders_idorders]) assignmentsMap[a.orders_idorders] = a;
    }

    const result = orders.map((o) => ({
      ...o.toObject(),
      current_assignment: assignmentsMap[o.orders_idorders] || null,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOrderItems = async (req, res) => {
  try {
    const orderId = Number(req.params.orders_idorders);
    const order = await Order.findOne({ orders_idorders: orderId, ...SENT_FILTER });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not available for super admin" });
    }

    const assignment = await PickerAssignment.findOne({ orders_idorders: orderId }).sort({
      assigned_at: -1,
    });

    const items = await OrderItem.find({ orders_idorders: orderId });

    let statusMap = {};
    if (assignment) {
      const itemStatuses = await PickerItemStatus.find({ assignment_id: assignment._id });
      statusMap = Object.fromEntries(itemStatuses.map((s) => [s.order_item_id, s]));
    }

    const result = items.map((item) => ({
      ...item.toObject(),
      picker_status: statusMap[item._id] || null,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const list = await Notification.find({ user_id: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100);
    const unreadCount = await Notification.countDocuments({
      user_id: req.user._id,
      read: false,
    });
    res.json({ success: true, data: list, unread_count: unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const { status, store_code, sent } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (store_code) filter.store_code = store_code;
    if (sent === "true") filter.sent_to_super_admin = true;
    if (sent === "false") filter.sent_to_super_admin = { $ne: true };

    const orders = await Order.find(filter).sort({ order_date: -1 }).limit(500);

    const orderIds = orders.map((o) => o.orders_idorders);
    const assignments = await PickerAssignment.find({ orders_idorders: { $in: orderIds } })
      .populate("assigned_to", "name email phone")
      .sort({ assigned_at: -1 });

    const assignmentsMap = {};
    for (const a of assignments) {
      if (!assignmentsMap[a.orders_idorders]) assignmentsMap[a.orders_idorders] = a;
    }

    const result = orders.map((o) => ({
      ...o.toObject(),
      current_assignment: assignmentsMap[o.orders_idorders] || null,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listStores = async (req, res) => {
  try {
    const stores = await Order.distinct("store_code");
    res.json({ success: true, data: stores.sort() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const { role, store_code, q } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (store_code) filter.store_codes = store_code;
    if (q) {
      const rx = new RegExp(q, "i");
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    const users = await PickerUser.find(filter)
      .select("-password")
      .sort({ role: 1, name: 1 });
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      role,
      store_codes = [],
      project_code = "RET3163",
      is_active = true,
    } = req.body;

    if (!name || !email || !phone || !password || !role) {
      return res
        .status(400)
        .json({ success: false, message: "name, email, phone, password, role are required" });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }
    if (role !== "super_admin" && (!Array.isArray(store_codes) || store_codes.length === 0)) {
      return res
        .status(400)
        .json({ success: false, message: "store_codes required for non super_admin users" });
    }

    const existing = await PickerUser.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: "Email already in use" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await PickerUser.create({
      name,
      email: email.toLowerCase(),
      phone,
      password: hashed,
      role,
      store_codes: role === "super_admin" ? [] : store_codes.map((c) => c.toUpperCase()),
      project_code,
      is_active,
    });

    const safe = user.toObject();
    delete safe.password;
    res.status(201).json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, role, store_codes, is_active, password, project_code } = req.body;

    const update = {};
    if (name !== undefined) update.name = name;
    if (phone !== undefined) update.phone = phone;
    if (project_code !== undefined) update.project_code = project_code;
    if (is_active !== undefined) update.is_active = is_active;
    if (role !== undefined) {
      if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({ success: false, message: "Invalid role" });
      }
      update.role = role;
    }
    if (store_codes !== undefined) {
      update.store_codes = Array.isArray(store_codes)
        ? store_codes.map((c) => String(c).toUpperCase())
        : [];
    }
    if (password) {
      update.password = await bcrypt.hash(password, 10);
    }

    const user = await PickerUser.findByIdAndUpdate(id, update, { new: true }).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user._id.toString() === id) {
      return res
        .status(400)
        .json({ success: false, message: "You cannot delete your own account" });
    }
    const user = await PickerUser.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === "all") {
      await Notification.updateMany(
        { user_id: req.user._id, read: false },
        { read: true }
      );
      return res.json({ success: true, message: "All marked as read" });
    }
    const n = await Notification.findOneAndUpdate(
      { _id: id, user_id: req.user._id },
      { read: true },
      { new: true }
    );
    if (!n) return res.status(404).json({ success: false, message: "Notification not found" });
    res.json({ success: true, data: n });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
