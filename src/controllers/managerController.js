const Order = require("../models/Order");
const PickerAssignment = require("../models/PickerAssignment");
const PickerItemStatus = require("../models/PickerItemStatus");
const PickerEscalation = require("../models/PickerEscalation");
const PickerUser = require("../models/PickerUser");
const Notification = require("../models/Notification");
const { reassignOrder } = require("../services/roundRobinService");
const { sendToUser } = require("../services/notificationService");

exports.getAllOrders = async (req, res) => {
  try {
    const { status, store_code } = req.query;
    const filter = { store_code: { $in: req.user.store_codes } };
    if (status) filter.status = status;
    if (store_code && req.user.store_codes.includes(store_code)) filter.store_code = store_code;

    const orders = await Order.find(filter).sort({ order_date: -1 });

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

exports.getPickers = async (req, res) => {
  try {
    const pickers = await PickerUser.find({
      role: "picker",
      store_codes: { $in: req.user.store_codes },
      is_active: true,
    }).select("-password");

    const pickerIds = pickers.map((p) => p._id);
    const activeCounts = await PickerAssignment.aggregate([
      { $match: { assigned_to: { $in: pickerIds }, status: { $in: ["assigned", "in_progress"] } } },
      { $group: { _id: "$assigned_to", active_orders: { $sum: 1 } } },
    ]);

    const countMap = Object.fromEntries(activeCounts.map((c) => [c._id.toString(), c.active_orders]));

    const result = pickers.map((p) => ({
      ...p.toObject(),
      active_orders: countMap[p._id.toString()] || 0,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const { unread_only } = req.query;
    const filter = { user_id: req.user._id };
    if (unread_only === "true") filter.read = false;

    const list = await Notification.find(filter)
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

exports.setPickerActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    if (typeof is_active !== "boolean") {
      return res.status(400).json({ success: false, message: "is_active boolean required" });
    }
    const picker = await PickerUser.findOne({
      _id: id,
      role: "picker",
      store_codes: { $in: req.user.store_codes },
    });
    if (!picker) return res.status(404).json({ success: false, message: "Picker not found" });

    picker.is_active = is_active;
    await picker.save();

    notifyManagersOfPickerToggle(picker, is_active, req.user).catch((e) =>
      console.error("notifyManagersOfPickerToggle failed:", e.message)
    );

    const safe = picker.toObject();
    delete safe.password;
    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

async function notifyManagersOfPickerToggle(picker, isActive, actor) {
  const managers = await PickerUser.find({
    role: "store_manager",
    store_codes: { $in: picker.store_codes },
    _id: { $ne: actor._id }, // don't notify the manager who did it
  }).select("_id");

  const title = isActive ? "Picker available" : "Picker paused";
  const body = isActive
    ? `${picker.name} marked available by ${actor.name}.`
    : `${picker.name} paused by ${actor.name} — round-robin will skip them.`;

  await Promise.all(
    managers.map((m) =>
      sendToUser(
        m._id,
        title,
        body,
        {
          picker_id: String(picker._id),
          picker_name: picker.name,
          is_active: String(isActive),
          actor_name: actor.name,
          store_codes: picker.store_codes.join(","),
        },
        "picker_availability"
      )
    )
  );
}

exports.reassignOrder = async (req, res) => {
  try {
    const { orders_idorders, new_picker_id } = req.body;
    if (!orders_idorders || !new_picker_id) {
      return res.status(400).json({ success: false, message: "orders_idorders and new_picker_id required" });
    }

    const assignment = await reassignOrder(orders_idorders, new_picker_id, req.user._id);
    res.json({ success: true, message: "Order reassigned", data: assignment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllRemarks = async (req, res) => {
  try {
    const { store_code } = req.query;
    const orderFilter = { store_code: { $in: req.user.store_codes } };
    if (store_code) orderFilter.store_code = store_code;

    const orders = await Order.find(orderFilter).select("orders_idorders");
    const orderIds = orders.map((o) => o.orders_idorders);

    const remarks = await PickerItemStatus.find({
      orders_idorders: { $in: orderIds },
      remark: { $ne: null },
    })
      .populate("picked_by", "name email")
      .sort({ picked_at: -1 });

    res.json({ success: true, data: remarks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createEscalation = async (req, res) => {
  try {
    const { assignment_id, orders_idorders, item_status_id, remark_summary, store_code, item_name } = req.body;

    const escalation = await PickerEscalation.create({
      assignment_id,
      orders_idorders,
      item_status_id: item_status_id || null,
      store_code: store_code || null,
      item_name: item_name || null,
      raised_by: req.user._id,
      remark_summary,
      status: "open",
    });

    res.status(201).json({ success: true, data: escalation });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.resolveEscalation = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution_note } = req.body;

    const escalation = await PickerEscalation.findByIdAndUpdate(
      id,
      { status: "resolved", resolution_note, resolved_at: new Date() },
      { new: true }
    );

    if (!escalation) return res.status(404).json({ success: false, message: "Escalation not found" });

    res.json({ success: true, data: escalation });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getEscalations = async (req, res) => {
  try {
    const { status } = req.query;
    // Show all escalations for the manager's stores, not just ones they personally raised
    const filter = { store_code: { $in: req.user.store_codes } };
    if (status) filter.status = status;

    const escalations = await PickerEscalation.find(filter)
      .populate("assignment_id", "status assigned_at")
      .populate("item_status_id", "picked_status remark")
      .populate("raised_by", "name email")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: escalations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOrderItems = async (req, res) => {
  try {
    const { orders_idorders } = req.params;
    const orderId = Number(orders_idorders);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const rawLimit = parseInt(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(200, rawLimit) : 0;

    const order = await Order.findOne({ orders_idorders: orderId, store_code: { $in: req.user.store_codes } });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const OrderItem = require("../models/OrderItem");
    const filter = { orders_idorders: orderId };
    const total = await OrderItem.countDocuments(filter);

    let query = OrderItem.find(filter);
    if (limit > 0) {
      query = query.skip((page - 1) * limit).limit(limit);
    }

    const items = await query;
    const itemStatuses = await PickerItemStatus.find({ orders_idorders: orderId });
    const statusMap = Object.fromEntries(itemStatuses.map((s) => [s.order_item_id, s]));

    const result = items.map((item) => ({
      ...item.toObject(),
      picker_status: statusMap[item._id.toString()] || null,
    }));

    res.json({
      success: true,
      data: result,
      pagination: limit > 0 ? { page, limit, total, has_more: page * limit < total } : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.triggerAssignment = async (req, res) => {
  try {
    const { orders_idorders, store_code, project_code } = req.body;
    const { assignOrder } = require("../services/roundRobinService");
    const assignment = await assignOrder(orders_idorders, store_code, project_code, req.user._id);
    res.status(201).json({ success: true, data: assignment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
