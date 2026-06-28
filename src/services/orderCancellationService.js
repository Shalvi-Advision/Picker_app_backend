const DeliveryAssignment = require("../models/DeliveryAssignment");
const DeliveryRoute = require("../models/DeliveryRoute");
const Order = require("../models/Order");
const PickerAssignment = require("../models/PickerAssignment");
const PickerUser = require("../models/PickerUser");
const { sendToUser } = require("./notificationService");
const { NOTIFICATION_TYPES } = require("../constants/notificationTypes");
const { syncRouteProgress } = require("./deliveryRouteService");

/**
 * Force-cancel an order from upstream admin — regardless of picker/rider state.
 */
async function cancelOrderFromUpstream({
  orders_idorders,
  reason = "Cancelled by upstream system",
  notify = true,
}) {
  const orderId = Number(orders_idorders);
  if (!Number.isFinite(orderId)) {
    return { error: "orders_idorders must be a number", status: 400 };
  }

  const order = await Order.findOne({ orders_idorders: orderId });
  if (!order) {
    return { error: "Order not found", status: 404 };
  }

  if (order.status === "cancelled" && order.delivery_status === "cancelled") {
    return { order, already_cancelled: true };
  }

  const cancelReason = String(reason || "Cancelled by upstream system").trim();

  const activePickerAssignments = await PickerAssignment.find({
    orders_idorders: orderId,
    status: { $in: ["assigned", "in_progress"] },
  }).lean();

  await PickerAssignment.updateMany(
    { orders_idorders: orderId, status: { $in: ["assigned", "in_progress"] } },
    { status: "cancelled", rejected_reason: cancelReason }
  );

  const activeDeliveries = await DeliveryAssignment.find({
    orders_idorders: orderId,
    status: { $in: ["assigned", "out_for_delivery"] },
  }).lean();

  await DeliveryAssignment.updateMany(
    { orders_idorders: orderId, status: { $in: ["assigned", "out_for_delivery"] } },
    { status: "cancelled", failed_reason: cancelReason }
  );

  const routeIds = new Set(
    activeDeliveries.filter((d) => d.route_id).map((d) => String(d.route_id))
  );

  for (const routeId of routeIds) {
    await DeliveryRoute.updateOne(
      { _id: routeId, "stops.orders_idorders": orderId },
      { $set: { "stops.$.status": "cancelled" } }
    );
    await syncRouteProgress(routeId);
  }

  await Order.updateOne(
    { orders_idorders: orderId },
    {
      status: "cancelled",
      delivery_status: "cancelled",
      current_delivery_assignment_id: null,
      current_route_id: null,
    }
  );

  if (notify) {
    const notified = new Set();

    for (const a of activePickerAssignments) {
      const id = String(a.assigned_to);
      if (notified.has(id)) continue;
      notified.add(id);
      sendToUser(
        a.assigned_to,
        "Order cancelled",
        `Order #${orderId} (${order.store_code}) was cancelled by admin.`,
        { orders_idorders: String(orderId), store_code: order.store_code },
        NOTIFICATION_TYPES.INFO
      ).catch(() => {});
    }

    for (const d of activeDeliveries) {
      const id = String(d.rider_id);
      if (notified.has(id)) continue;
      notified.add(id);
      sendToUser(
        d.rider_id,
        "Delivery cancelled",
        `Order #${orderId} (${order.store_code}) was cancelled — stop delivery.`,
        {
          orders_idorders: String(orderId),
          store_code: order.store_code,
          assignment_id: String(d._id),
        },
        NOTIFICATION_TYPES.INFO
      ).catch(() => {});
    }

    const managers = await PickerUser.find({
      role: "manager",
      store_codes: order.store_code,
    }).select("_id");

    await Promise.all(
      managers.map((m) =>
        sendToUser(
          m._id,
          "Order cancelled",
          `Order #${orderId} (${order.store_code}) cancelled upstream.`,
          { orders_idorders: String(orderId), store_code: order.store_code },
          NOTIFICATION_TYPES.INFO
        )
      )
    ).catch(() => {});
  }

  const updated = await Order.findOne({ orders_idorders: orderId }).lean();
  return {
    order: updated,
    picker_assignments_cancelled: activePickerAssignments.length,
    delivery_assignments_cancelled: activeDeliveries.length,
    routes_updated: routeIds.size,
  };
}

module.exports = {
  cancelOrderFromUpstream,
};
