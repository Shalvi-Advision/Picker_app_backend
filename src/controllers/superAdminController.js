const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const PickerAssignment = require("../models/PickerAssignment");
const PickerItemStatus = require("../models/PickerItemStatus");
const Notification = require("../models/Notification");

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
