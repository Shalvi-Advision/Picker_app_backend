const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const PickerAssignment = require("../models/PickerAssignment");
const DeliveryAssignment = require("../models/DeliveryAssignment");
const DeliveryRoute = require("../models/DeliveryRoute");
const PickerItemStatus = require("../models/PickerItemStatus");
const PickerEscalation = require("../models/PickerEscalation");
const PickerUser = require("../models/PickerUser");
const Notification = require("../models/Notification");
const { reassignOrder } = require("../services/roundRobinService");
const { sendToUser } = require("../services/notificationService");
const {
  MIN_STOPS,
  MAX_STOPS,
  suggestStopOrder,
  estimateRouteMetrics,
  getStoreOrigin,
  stopsFromOrders,
  buildGoogleMapsDirectionsUrl,
} = require("../services/routeOptimizationService");

// Fetch all order_items for the given order IDs in one query and group them by
// orders_idorders, attaching each item's picker_status so embedded items match
// the standalone /orders/:id/items endpoint.
const buildItemsMap = async (orderIds) => {
  if (!orderIds.length) return {};

  const [items, itemStatuses] = await Promise.all([
    OrderItem.find({ orders_idorders: { $in: orderIds } }).lean(),
    PickerItemStatus.find({ orders_idorders: { $in: orderIds } }).lean(),
  ]);

  const statusByItemId = Object.fromEntries(
    itemStatuses.map((s) => [s.order_item_id, s])
  );

  const map = {};
  for (const item of items) {
    (map[item.orders_idorders] ||= []).push({
      ...item,
      picker_status: statusByItemId[String(item._id)] || null,
    });
  }
  return map;
};

exports.getAllOrders = async (req, res) => {
  try {
    const { status, store_code, delivery_status } = req.query;
    const filter = { store_code: { $in: req.user.store_codes } };
    if (status) filter.status = status;
    if (delivery_status) filter.delivery_status = delivery_status;
    if (store_code && req.user.store_codes.includes(store_code)) filter.store_code = store_code;

    const orders = await Order.find(filter).sort({ order_date: -1 });

    const orderIds = orders.map((o) => o.orders_idorders);
    const [assignments, deliveryAssignments] = await Promise.all([
      PickerAssignment.find({ orders_idorders: { $in: orderIds } })
        .populate("assigned_to", "name email phone")
        .sort({ assigned_at: -1 }),
      DeliveryAssignment.find({ orders_idorders: { $in: orderIds } })
        .populate("rider_id", "name email phone rider_availability")
        .sort({ assigned_at: -1 }),
    ]);

    const assignmentsMap = {};
    for (const a of assignments) {
      if (!assignmentsMap[a.orders_idorders]) assignmentsMap[a.orders_idorders] = a;
    }

    const deliveryMap = {};
    for (const a of deliveryAssignments) {
      if (!deliveryMap[a.orders_idorders]) deliveryMap[a.orders_idorders] = a;
    }

    const itemsMap = await buildItemsMap(orderIds);

    const result = orders.map((o) => ({
      ...o.toObject(),
      current_assignment: assignmentsMap[o.orders_idorders] || null,
      current_delivery_assignment: deliveryMap[o.orders_idorders] || null,
      items: itemsMap[o.orders_idorders] || [],
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPickers = async (req, res) => {
  try {
    // Return every picker in the manager's stores, including paused ones —
    // the manager needs to see them to toggle them back on.
    const pickers = await PickerUser.find({
      role: "picker",
      store_codes: { $in: req.user.store_codes },
    })
      .select("-password")
      .sort({ is_active: -1, name: 1 }); // active first, then alphabetical

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

// Manager flags a completed order for the super admin to review.
exports.sendOrderToSuperAdmin = async (req, res) => {
  try {
    const orderId = Number(req.params.orders_idorders);
    const order = await Order.findOne({ orders_idorders: orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (!req.user.store_codes.includes(order.store_code)) {
      return res.status(403).json({ success: false, message: "Order is outside your stores" });
    }
    if (order.status !== "completed") {
      return res
        .status(400)
        .json({ success: false, message: "Only completed orders can be sent to super admin" });
    }
    if (order.sent_to_super_admin) {
      return res.json({ success: true, data: order, already_sent: true });
    }

    order.sent_to_super_admin = true;
    order.sent_to_super_admin_at = new Date();
    order.sent_to_super_admin_by = req.user._id;
    await order.save();

    // Fire-and-forget notify super admins.
    notifySuperAdminsOfOrder(order, req.user).catch((e) =>
      console.error("notifySuperAdminsOfOrder failed:", e.message)
    );

    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

async function notifySuperAdminsOfOrder(order, manager) {
  // Notify both mobile `admin` users and the web `super_admin` (Retail Magic owner).
  const admins = await PickerUser.find({ role: { $in: ["admin", "super_admin"] } }).select("_id");
  await Promise.all(
    admins.map((a) =>
      sendToUser(
        a._id,
        "Order sent for review",
        `Order #${order.orders_idorders} (${order.store_code}) sent by ${manager.name}.`,
        {
          orders_idorders: String(order.orders_idorders),
          store_code: order.store_code,
          manager_name: manager.name || "",
        },
        "order_sent_to_super_admin"
      )
    )
  );
}

exports.getRiders = async (req, res) => {
  try {
    const riders = await PickerUser.find({
      role: "rider",
      store_codes: { $in: req.user.store_codes },
    })
      .select("-password")
      .sort({ is_active: -1, rider_availability: 1, name: 1 });

    const riderIds = riders.map((r) => r._id);
    const activeCounts = await DeliveryAssignment.aggregate([
      {
        $match: {
          rider_id: { $in: riderIds },
          status: { $in: ["assigned", "out_for_delivery"] },
        },
      },
      { $group: { _id: "$rider_id", active_deliveries: { $sum: 1 } } },
    ]);

    const countMap = Object.fromEntries(
      activeCounts.map((c) => [c._id.toString(), c.active_deliveries])
    );

    const result = riders.map((r) => ({
      ...r.toObject(),
      active_deliveries: countMap[r._id.toString()] || 0,
      active_orders: countMap[r._id.toString()] || 0,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRiderLocations = async (req, res) => {
  try {
    const riders = await PickerUser.find({
      role: "rider",
      is_active: true,
      store_codes: { $in: req.user.store_codes },
    })
      .select("name phone rider_availability store_codes last_location")
      .lean();

    const riderIds = riders.map((r) => r._id);
    const activeAssignments = await DeliveryAssignment.find({
      rider_id: { $in: riderIds },
      status: { $in: ["assigned", "out_for_delivery"] },
    }).lean();

    const activeByRider = {};
    for (const a of activeAssignments) {
      const key = a.rider_id.toString();
      if (!activeByRider[key]) activeByRider[key] = [];
      activeByRider[key].push(a.orders_idorders);
    }

    const result = riders
      .filter((r) => r.last_location?.latitude && r.last_location?.longitude)
      .map((r) => ({
        rider_id: r._id,
        name: r.name,
        phone: r.phone,
        rider_availability: r.rider_availability,
        store_codes: r.store_codes,
        last_location: r.last_location,
        active_orders: activeByRider[r._id.toString()] || [],
      }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRider = async (req, res) => {
  try {
    const rider = await PickerUser.findOne({
      _id: req.params.id,
      role: "rider",
      store_codes: { $in: req.user.store_codes },
    }).select("-password");

    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    const recentDeliveries = await DeliveryAssignment.find({ rider_id: rider._id })
      .sort({ assigned_at: -1 })
      .limit(25)
      .lean();

    const orderIds = recentDeliveries.map((d) => d.orders_idorders);
    const orders = await Order.find({ orders_idorders: { $in: orderIds } }).lean();
    const ordersMap = Object.fromEntries(orders.map((o) => [o.orders_idorders, o]));

    const deliveries = recentDeliveries.map((d) => ({
      ...d,
      order: ordersMap[d.orders_idorders] || null,
    }));

    res.json({ success: true, data: { rider, deliveries } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.assignRider = async (req, res) => {
  try {
    const orderId = Number(req.params.orders_idorders);
    const { rider_id } = req.body;

    if (!rider_id) {
      return res.status(400).json({ success: false, message: "rider_id is required" });
    }

    const order = await Order.findOne({ orders_idorders: orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (!req.user.store_codes.includes(order.store_code)) {
      return res.status(403).json({ success: false, message: "Order is outside your stores" });
    }
    if (order.status !== "completed") {
      return res
        .status(400)
        .json({ success: false, message: "Only picked/completed orders can be assigned for delivery" });
    }
    if (order.delivery_status && !["ready_for_delivery", "failed", "cancelled"].includes(order.delivery_status)) {
      return res.status(400).json({
        success: false,
        message: `Order delivery status is "${order.delivery_status}" — cannot assign rider`,
      });
    }

    const activeDelivery = await DeliveryAssignment.findOne({
      orders_idorders: orderId,
      status: { $in: ["assigned", "out_for_delivery"] },
    });
    if (activeDelivery) {
      return res.status(409).json({
        success: false,
        message: "Order already has an active delivery assignment",
      });
    }

    const rider = await PickerUser.findOne({
      _id: rider_id,
      role: "rider",
      is_active: true,
      store_codes: order.store_code,
    });
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found for this store" });
    }

    const assignment = await DeliveryAssignment.create({
      orders_idorders: orderId,
      store_code: order.store_code,
      project_code: order.project_code,
      rider_id: rider._id,
      assigned_by: req.user._id,
      status: "assigned",
    });

    await Order.updateOne(
      { orders_idorders: orderId },
      {
        delivery_status: "assigned",
        current_delivery_assignment_id: assignment._id,
      }
    );

    sendToUser(
      rider._id,
      "New delivery assigned",
      `Order #${orderId} (${order.store_code}) assigned to you.`,
      {
        orders_idorders: String(orderId),
        store_code: order.store_code,
        assignment_id: String(assignment._id),
      },
      "delivery_assigned"
    ).catch((e) => console.error("assignRider notify failed:", e.message));

    const populated = await DeliveryAssignment.findById(assignment._id).populate(
      "rider_id",
      "name email phone rider_availability"
    );

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.reassignRider = async (req, res) => {
  try {
    const { orders_idorders, new_rider_id } = req.body;
    const orderId = Number(orders_idorders);

    if (!new_rider_id) {
      return res.status(400).json({ success: false, message: "new_rider_id is required" });
    }

    const order = await Order.findOne({ orders_idorders: orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (!req.user.store_codes.includes(order.store_code)) {
      return res.status(403).json({ success: false, message: "Order is outside your stores" });
    }

    const current = await DeliveryAssignment.findOne({
      orders_idorders: orderId,
      status: { $in: ["assigned", "out_for_delivery"] },
    });
    if (!current) {
      return res.status(404).json({ success: false, message: "No active delivery assignment found" });
    }

    const rider = await PickerUser.findOne({
      _id: new_rider_id,
      role: "rider",
      is_active: true,
      store_codes: order.store_code,
    });
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found for this store" });
    }

    const oldRiderId = current.rider_id;
    current.status = "cancelled";
    await current.save();

    const assignment = await DeliveryAssignment.create({
      orders_idorders: orderId,
      store_code: order.store_code,
      project_code: order.project_code,
      rider_id: rider._id,
      assigned_by: req.user._id,
      reassigned_from: oldRiderId,
      reassigned_at: new Date(),
      status: "assigned",
    });

    await Order.updateOne(
      { orders_idorders: orderId },
      {
        delivery_status: "assigned",
        current_delivery_assignment_id: assignment._id,
      }
    );

    await Promise.all([
      sendToUser(
        rider._id,
        "Delivery assigned",
        `Order #${orderId} (${order.store_code}) reassigned to you.`,
        {
          orders_idorders: String(orderId),
          assignment_id: String(assignment._id),
        },
        "delivery_assigned"
      ),
      sendToUser(
        oldRiderId,
        "Delivery reassigned",
        `Order #${orderId} was reassigned to another rider.`,
        { orders_idorders: String(orderId) },
        "delivery_reassigned"
      ),
    ]).catch((e) => console.error("reassignRider notify failed:", e.message));

    const populated = await DeliveryAssignment.findById(assignment._id).populate(
      "rider_id",
      "name email phone rider_availability"
    );

    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

async function validateOrdersForRoute(orderIds, managerStoreCodes) {
  if (!Array.isArray(orderIds) || orderIds.length < MIN_STOPS || orderIds.length > MAX_STOPS) {
    return {
      error: `Select between ${MIN_STOPS} and ${MAX_STOPS} orders for a route`,
    };
  }

  const ids = orderIds.map(Number);
  const orders = await Order.find({ orders_idorders: { $in: ids } }).lean();
  if (orders.length !== ids.length) {
    return { error: "One or more orders not found" };
  }

  const storeCode = orders[0].store_code;
  const projectCode = orders[0].project_code;

  for (const o of orders) {
    if (!managerStoreCodes.includes(o.store_code)) {
      return { error: `Order #${o.orders_idorders} is outside your stores` };
    }
    if (o.store_code !== storeCode || o.project_code !== projectCode) {
      return { error: "All orders must be from the same store and project" };
    }
    if (o.status !== "completed") {
      return { error: `Order #${o.orders_idorders} is not picked yet` };
    }
    if (o.delivery_status && !["ready_for_delivery", "failed", "cancelled"].includes(o.delivery_status)) {
      return {
        error: `Order #${o.orders_idorders} delivery status is "${o.delivery_status}" — not available for routing`,
      };
    }
  }

  const active = await DeliveryAssignment.find({
    orders_idorders: { $in: ids },
    status: { $in: ["assigned", "out_for_delivery"] },
  }).lean();
  if (active.length) {
    return {
      error: `Order #${active[0].orders_idorders} already has an active delivery assignment`,
    };
  }

  return { orders, storeCode, projectCode };
}

exports.suggestDeliveryRouteOrder = async (req, res) => {
  try {
    const { orders_idorders, stop_order } = req.body;
    const validated = await validateOrdersForRoute(orders_idorders, req.user.store_codes);
    if (validated.error) {
      return res.status(400).json({ success: false, message: validated.error });
    }

    const { orders, storeCode, projectCode } = validated;
    const origin = await getStoreOrigin(projectCode, storeCode);
    const rawStops = stopsFromOrders(orders);
    const manual = Array.isArray(stop_order) ? stop_order.map(Number) : null;
    const ordered = suggestStopOrder(origin, rawStops, manual);
    const metrics = estimateRouteMetrics(origin, ordered);

    res.json({
      success: true,
      data: {
        stop_order: ordered.map((s) => s.orders_idorders),
        stops: ordered.map((s, i) => ({
          sequence: i + 1,
          orders_idorders: s.orders_idorders,
          latitude: s.latitude,
          longitude: s.longitude,
          delivery_details: s.delivery_details,
        })),
        estimated_duration_min: metrics.estimated_duration_min,
        estimated_distance_km: metrics.estimated_distance_km,
        store_origin: origin,
        maps_url: buildGoogleMapsDirectionsUrl(origin, ordered),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createDeliveryRoute = async (req, res) => {
  try {
    const { orders_idorders, rider_id, stop_order } = req.body;
    if (!rider_id) {
      return res.status(400).json({ success: false, message: "rider_id is required" });
    }

    const validated = await validateOrdersForRoute(orders_idorders, req.user.store_codes);
    if (validated.error) {
      return res.status(400).json({ success: false, message: validated.error });
    }

    const { orders, storeCode, projectCode } = validated;
    const rider = await PickerUser.findOne({
      _id: rider_id,
      role: "rider",
      is_active: true,
      store_codes: storeCode,
    });
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found for this store" });
    }

    const origin = await getStoreOrigin(projectCode, storeCode);
    const rawStops = stopsFromOrders(orders);
    const manual = Array.isArray(stop_order) ? stop_order.map(Number) : null;
    const ordered = suggestStopOrder(origin, rawStops, manual);
    const metrics = estimateRouteMetrics(origin, ordered);

    const deliveryDate = orders.find((o) => o.delivery_date)?.delivery_date || null;
    const deliverySlot = orders.find((o) => o.delivery_slot)?.delivery_slot || null;

    const route = await DeliveryRoute.create({
      store_code: storeCode,
      project_code: projectCode,
      rider_id: rider._id,
      assigned_by: req.user._id,
      delivery_date: deliveryDate,
      delivery_slot: deliverySlot,
      status: "planned",
      stops: ordered.map((s, i) => ({
        sequence: i + 1,
        orders_idorders: s.orders_idorders,
        latitude: s.latitude,
        longitude: s.longitude,
        status: "pending",
      })),
      estimated_duration_min: metrics.estimated_duration_min,
      estimated_distance_km: metrics.estimated_distance_km,
    });

    const assignments = [];
    for (let i = 0; i < ordered.length; i++) {
      const stop = ordered[i];
      const assignment = await DeliveryAssignment.create({
        orders_idorders: stop.orders_idorders,
        store_code: storeCode,
        project_code: projectCode,
        rider_id: rider._id,
        assigned_by: req.user._id,
        route_id: route._id,
        stop_sequence: i + 1,
        status: "assigned",
      });
      assignments.push(assignment);

      await Order.updateOne(
        { orders_idorders: stop.orders_idorders },
        {
          delivery_status: "assigned",
          current_delivery_assignment_id: assignment._id,
          current_route_id: route._id,
        }
      );
    }

    sendToUser(
      rider._id,
      "New delivery route assigned",
      `Route with ${ordered.length} stops (${storeCode}) assigned to you.`,
      {
        route_id: String(route._id),
        store_code: storeCode,
        stop_count: String(ordered.length),
      },
      "delivery_route_assigned"
    ).catch((e) => console.error("createDeliveryRoute notify failed:", e.message));

    const populated = await DeliveryRoute.findById(route._id)
      .populate("rider_id", "name email phone rider_availability")
      .lean();

    res.status(201).json({
      success: true,
      data: {
        route: populated,
        assignments,
        maps_url: buildGoogleMapsDirectionsUrl(origin, ordered),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getDeliveryRoutes = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { store_code: { $in: req.user.store_codes } };
    if (status) filter.status = status;

    const routes = await DeliveryRoute.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("rider_id", "name email phone rider_availability")
      .lean();

    res.json({ success: true, data: routes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getDeliveryRoute = async (req, res) => {
  try {
    const route = await DeliveryRoute.findById(req.params.id)
      .populate("rider_id", "name email phone rider_availability")
      .lean();

    if (!route) {
      return res.status(404).json({ success: false, message: "Route not found" });
    }
    if (!req.user.store_codes.includes(route.store_code)) {
      return res.status(403).json({ success: false, message: "Route is outside your stores" });
    }

    const orderIds = route.stops.map((s) => s.orders_idorders);
    const [orders, assignments] = await Promise.all([
      Order.find({ orders_idorders: { $in: orderIds } }).lean(),
      DeliveryAssignment.find({ route_id: route._id }).lean(),
    ]);
    const ordersMap = Object.fromEntries(orders.map((o) => [o.orders_idorders, o]));
    const assignMap = Object.fromEntries(assignments.map((a) => [a.orders_idorders, a]));

    const origin = await getStoreOrigin(route.project_code, route.store_code);
    const coordStops = route.stops
      .map((s) => {
        const c = parseFloat(s.latitude);
        const lo = parseFloat(s.longitude);
        if (!Number.isFinite(c) || !Number.isFinite(lo)) return null;
        return { lat: c, lng: lo };
      })
      .filter(Boolean);

    res.json({
      success: true,
      data: {
        ...route,
        stops: route.stops.map((s) => ({
          ...s,
          order: ordersMap[s.orders_idorders] || null,
          assignment: assignMap[s.orders_idorders] || null,
        })),
        maps_url: buildGoogleMapsDirectionsUrl(origin, coordStops),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
