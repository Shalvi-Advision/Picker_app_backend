const PickerAssignment = require("../models/PickerAssignment");
const PickerItemStatus = require("../models/PickerItemStatus");
const OrderItem = require("../models/OrderItem");
const Order = require("../models/Order");
const PickerUser = require("../models/PickerUser");

exports.getMyOrders = async (req, res) => {
  try {
    const { status } = req.query;
    // Only show non-final-rejected assignments by default; rejected ones go back to manager pool
    const filter = {
      assigned_to: req.user._id,
      status: { $nin: ["reassigned"] },
    };
    if (status) filter.status = status;

    const assignments = await PickerAssignment.find(filter).sort({ assigned_at: -1 });

    console.log(
      `[getMyOrders] picker=${req.user.email} id=${req.user._id} found ${assignments.length} assignment(s), filter=${JSON.stringify(filter)}`
    );

    const orderIds = assignments.map((a) => a.orders_idorders);
    const orders = await Order.find({ orders_idorders: { $in: orderIds } });
    const ordersMap = Object.fromEntries(orders.map((o) => [o.orders_idorders, o]));

    const result = assignments.map((a) => ({
      _id: a._id,
      assignment_id: a._id,
      orders_idorders: a.orders_idorders,
      store_code: a.store_code,
      project_code: a.project_code,
      status: a.status,
      assigned_at: a.assigned_at,
      completed_at: a.completed_at,
      rejected_reason: a.rejected_reason,
      order: ordersMap[a.orders_idorders] || null,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOrderItems = async (req, res) => {
  try {
    const { orders_idorders } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const rawLimit = parseInt(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(200, rawLimit) : 0;

    const assignment = await PickerAssignment.findOne({
      orders_idorders: Number(orders_idorders),
      assigned_to: req.user._id,
      status: { $in: ["assigned", "in_progress", "completed"] },
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    const filter = { orders_idorders: Number(orders_idorders) };
    const total = await OrderItem.countDocuments(filter);

    let query = OrderItem.find(filter);
    if (limit > 0) {
      query = query.skip((page - 1) * limit).limit(limit);
    }

    const items = await query;
    const itemStatuses = await PickerItemStatus.find({ assignment_id: assignment._id });
    const statusMap = Object.fromEntries(itemStatuses.map((s) => [s.order_item_id, s]));

    const result = items.map((item) => ({
      ...item.toObject(),
      picker_status: statusMap[item._id] || null,
    }));

    res.json({
      success: true,
      assignment_id: assignment._id,
      data: result,
      pagination: limit > 0 ? { page, limit, total, has_more: page * limit < total } : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.startPicking = async (req, res) => {
  try {
    const { orders_idorders } = req.params;

    const assignment = await PickerAssignment.findOneAndUpdate(
      { orders_idorders: Number(orders_idorders), assigned_to: req.user._id, status: "assigned" },
      { status: "in_progress" },
      { new: true }
    );

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found or already started" });
    }

    await Order.updateOne({ orders_idorders: Number(orders_idorders) }, { status: "in_progress" });

    res.json({ success: true, data: assignment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateItemStatus = async (req, res) => {
  try {
    const { assignment_id, order_item_id } = req.params;
    const { picked_status, picked_quantity, remark, photo_url } = req.body;

    const item = await OrderItem.findById(order_item_id);
    if (!item) return res.status(404).json({ success: false, message: "Item not found" });

    const updated = await PickerItemStatus.findOneAndUpdate(
      { assignment_id, order_item_id },
      {
        assignment_id,
        order_item_id,
        orders_idorders: item.orders_idorders,
        p_code: item.p_code,
        barcode: item.barcode,
        item_name: item.item_name,
        ordered_quantity: item.ordered_quantity,
        picked_status,
        picked_quantity: picked_quantity ?? 0,
        remark: remark ?? null,
        photo_url: photo_url ?? null,
        picked_by: req.user._id,
        picked_at: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.completeOrder = async (req, res) => {
  try {
    const { orders_idorders } = req.params;

    const assignment = await PickerAssignment.findOneAndUpdate(
      { orders_idorders: Number(orders_idorders), assigned_to: req.user._id, status: "in_progress" },
      { status: "completed", completed_at: new Date() },
      { new: true }
    );

    if (!assignment) {
      return res.status(404).json({ success: false, message: "No in-progress assignment found" });
    }

    await Order.updateOne({ orders_idorders: Number(orders_idorders) }, { status: "completed" });

    res.json({ success: true, message: "Order completed", data: assignment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMyNotifications = async (req, res) => {
  try {
    const Notification = require("../models/Notification");
    const { unread_only } = req.query;
    const filter = { user_id: req.user._id };
    if (unread_only === "true") filter.read = false;
    const list = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
    const unreadCount = await Notification.countDocuments({ user_id: req.user._id, read: false });
    res.json({ success: true, data: list, unread_count: unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markMyNotificationRead = async (req, res) => {
  try {
    const Notification = require("../models/Notification");
    const { id } = req.params;
    if (id === "all") {
      await Notification.updateMany({ user_id: req.user._id, read: false }, { read: true });
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

exports.setMyAvailability = async (req, res) => {
  try {
    const { is_active } = req.body;
    if (typeof is_active !== "boolean") {
      return res.status(400).json({ success: false, message: "is_active boolean required" });
    }
    const updated = await PickerUser.findOneAndUpdate(
      { _id: req.user._id, role: "picker" },
      { is_active },
      { new: true }
    ).select("-password");
    if (!updated) return res.status(404).json({ success: false, message: "Picker not found" });

    // Fire-and-forget: notify managers of the picker's stores.
    notifyManagersOfAvailability(updated, is_active).catch((e) =>
      console.error("notifyManagersOfAvailability failed:", e.message)
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

async function notifyManagersOfAvailability(picker, isActive) {
  const { sendToUser } = require("../services/notificationService");
  const managers = await PickerUser.find({
    role: "store_manager",
    store_codes: { $in: picker.store_codes },
  }).select("_id");

  const title = isActive ? "Picker available" : "Picker paused";
  const body = isActive
    ? `${picker.name} is now available for new orders.`
    : `${picker.name} has paused — round-robin will skip them.`;

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
          store_codes: picker.store_codes.join(","),
        },
        "picker_availability"
      )
    )
  );
}

exports.rejectOrder = async (req, res) => {
  try {
    const { orders_idorders } = req.params;
    const { reason } = req.body;

    const assignment = await PickerAssignment.findOneAndUpdate(
      {
        orders_idorders: Number(orders_idorders),
        assigned_to: req.user._id,
        status: { $in: ["assigned", "in_progress"] },
      },
      { status: "rejected", rejected_reason: reason || null },
      { new: true }
    );

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    await Order.updateOne({ orders_idorders: Number(orders_idorders) }, { status: "pending" });

    res.json({ success: true, message: "Order rejected", data: assignment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
