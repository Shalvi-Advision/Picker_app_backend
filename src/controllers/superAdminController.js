const bcrypt = require("bcryptjs");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const PickerAssignment = require("../models/PickerAssignment");
const PickerItemStatus = require("../models/PickerItemStatus");
const Notification = require("../models/Notification");
const PickerUser = require("../models/PickerUser");
const WebhookLog = require("../models/WebhookLog");
const { replaceOrders, PROJECT_CODE } = require("../services/orderSyncService");
const { CAPABILITY_KEYS } = require("../constants/capabilities");

const ALLOWED_ROLES = ["picker", "manager", "admin", "super_admin"];

// Keep only known capability keys with boolean values. Returns a plain object
// suitable for the PickerUser.capability_overrides Map field.
function sanitizeOverrides(input) {
  const clean = {};
  if (input && typeof input === "object" && !Array.isArray(input)) {
    for (const [key, val] of Object.entries(input)) {
      if (CAPABILITY_KEYS.has(key)) clean[key] = Boolean(val);
    }
  }
  return clean;
}

// Only orders that have been explicitly sent up by a manager.
const SENT_FILTER = { sent_to_super_admin: true };

// Fetch all order_items for the given order IDs in one query and group them by
// orders_idorders, attaching each item's picker_status (from the latest
// assignment) so embedded items match the standalone items endpoint.
const buildItemsMap = async (orderIds) => {
  if (!orderIds.length) return {};

  const [items, assignments] = await Promise.all([
    OrderItem.find({ orders_idorders: { $in: orderIds } }).lean(),
    PickerAssignment.find({ orders_idorders: { $in: orderIds } })
      .sort({ assigned_at: -1 })
      .lean(),
  ]);

  // Latest assignment per order (used to resolve picker item statuses).
  const latestAssignment = {};
  for (const a of assignments) {
    if (!latestAssignment[a.orders_idorders]) latestAssignment[a.orders_idorders] = a;
  }
  const assignmentIds = Object.values(latestAssignment).map((a) => a._id);

  const itemStatuses = assignmentIds.length
    ? await PickerItemStatus.find({ assignment_id: { $in: assignmentIds } }).lean()
    : [];
  const statusByItemId = Object.fromEntries(itemStatuses.map((s) => [s.order_item_id, s]));

  const map = {};
  for (const item of items) {
    (map[item.orders_idorders] ||= []).push({
      ...item,
      picker_status: statusByItemId[item._id] || null,
    });
  }
  return map;
};

exports.getDashboardKpis = async (req, res) => {
  try {
    const { project_code } = req.query;
    const baseFilter = { ...SENT_FILTER };
    if (project_code) baseFilter.project_code = project_code.toUpperCase();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, thisMonth, agg] = await Promise.all([
      Order.countDocuments(baseFilter),
      Order.countDocuments({ ...baseFilter, sent_to_super_admin_at: { $gte: monthStart } }),
      Order.aggregate([
        { $match: baseFilter },
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
    const { store_code, project_code } = req.query;
    const filter = { ...SENT_FILTER };
    if (project_code) filter.project_code = project_code.toUpperCase();
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

    const itemsMap = await buildItemsMap(orderIds);

    const result = orders.map((o) => ({
      ...o.toObject(),
      current_assignment: assignmentsMap[o.orders_idorders] || null,
      items: itemsMap[o.orders_idorders] || [],
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOrderItems = async (req, res) => {
  try {
    const orderId = Number(req.params.orders_idorders);
    const order = await Order.findOne({ orders_idorders: orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
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
    const { status, store_code, sent, project_code } = req.query;
    const filter = {};
    if (project_code) filter.project_code = project_code.toUpperCase();
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

    const itemsMap = await buildItemsMap(orderIds);

    const result = orders.map((o) => ({
      ...o.toObject(),
      current_assignment: assignmentsMap[o.orders_idorders] || null,
      items: itemsMap[o.orders_idorders] || [],
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listStores = async (req, res) => {
  try {
    const { project_code } = req.query;
    const filter = project_code ? { project_code: project_code.toUpperCase() } : {};
    const stores = await Order.distinct("store_code", filter);
    res.json({ success: true, data: stores.sort() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listProjects = async (_req, res) => {
  try {
    const projects = await Order.distinct("project_code");
    res.json({ success: true, data: projects.filter(Boolean).sort() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const { role, store_code, q, project_code } = req.query;
    const filter = {};
    if (project_code) filter.project_code = project_code.toUpperCase();
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
      project_code = "",
      is_active = true,
      capability_overrides = {},
    } = req.body;

    if (!name || !email || !phone || !password || !role) {
      return res
        .status(400)
        .json({ success: false, message: "name, email, phone, password, role are required" });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }
    // picker + manager are store-scoped; admin + super_admin are unscoped.
    const isUnscoped = role === "admin" || role === "super_admin";
    if (!isUnscoped && (!Array.isArray(store_codes) || store_codes.length === 0)) {
      return res
        .status(400)
        .json({ success: false, message: "store_codes required for picker and manager roles" });
    }
    if (!isUnscoped && !project_code) {
      return res
        .status(400)
        .json({ success: false, message: "project_code required for picker and manager roles" });
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
      store_codes: isUnscoped ? [] : store_codes.map((c) => c.toUpperCase()),
      project_code,
      is_active,
      capability_overrides: sanitizeOverrides(capability_overrides),
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
    const { name, phone, role, store_codes, is_active, password, project_code, capability_overrides } =
      req.body;

    const update = {};
    if (name !== undefined) update.name = name;
    if (phone !== undefined) update.phone = phone;
    if (project_code !== undefined) update.project_code = project_code;
    if (is_active !== undefined) update.is_active = is_active;
    if (capability_overrides !== undefined) {
      update.capability_overrides = sanitizeOverrides(capability_overrides);
    }
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

// DESTRUCTIVE: pull fresh pending orders from the upstream project API, then
// wipe and replace all orders / order_items / downstream picker data for the
// project. Use the cron's incremental upsert for routine syncing.
exports.syncOrders = async (req, res) => {
  try {
    const project_code = req.body?.project_code || PROJECT_CODE;
    const result = await replaceOrders(project_code);
    res.json({ success: true, message: "Orders replaced from source", data: result });
  } catch (err) {
    res.status(502).json({ success: false, message: err.message });
  }
};

exports.getWebhookLogs = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const skip  = parseInt(req.query.skip) || 0;
    const { status, store_code, project_code } = req.query;

    const filter = {};
    if (status)       filter.status       = status;
    if (store_code)   filter.store_code   = store_code.toUpperCase();
    if (project_code) filter.project_code = project_code.toUpperCase();

    const [logs, total] = await Promise.all([
      WebhookLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WebhookLog.countDocuments(filter),
    ]);

    res.json({ success: true, data: { logs, total, limit, skip } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
