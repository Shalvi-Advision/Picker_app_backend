const DeliveryAssignment = require("../models/DeliveryAssignment");
const Order = require("../models/Order");
const PickerUser = require("../models/PickerUser");
const { sendToUser } = require("./notificationService");
const { NOTIFICATION_TYPES } = require("../constants/notificationTypes");

async function findRiderForStore({ rider_id, rider_email, storeCode }) {
  const filter = { role: "rider", is_active: true };
  if (rider_id) filter._id = rider_id;
  else if (rider_email) filter.email = String(rider_email).toLowerCase().trim();
  else return null;

  const rider = await PickerUser.findOne(filter);
  if (!rider) return null;
  if (storeCode && !rider.store_codes.includes(storeCode)) return null;
  return rider;
}

/**
 * Assign a rider to an order (creates DeliveryAssignment + updates Order).
 */
async function assignRiderToOrder({
  orders_idorders,
  rider_id,
  rider_email,
  assigned_by = null,
  notify = true,
  prepare_order = false,
  replace_active = false,
  latitude,
  longitude,
}) {
  const orderId = Number(orders_idorders);
  if (!Number.isFinite(orderId)) {
    return { error: "orders_idorders must be a number", status: 400 };
  }

  const order = await Order.findOne({ orders_idorders: orderId });
  if (!order) {
    return { error: "Order not found", status: 404 };
  }

  if (prepare_order) {
    const orderUpdate = {
      status: "completed",
      delivery_status: "ready_for_delivery",
    };
    if (latitude != null) orderUpdate.latitude = String(latitude);
    else if (!order.latitude) orderUpdate.latitude = "19.0760";
    if (longitude != null) orderUpdate.longitude = String(longitude);
    else if (!order.longitude) orderUpdate.longitude = "72.8777";
    await Order.updateOne({ orders_idorders: orderId }, orderUpdate);
    Object.assign(order, orderUpdate);
  }

  if (order.status !== "completed") {
    return {
      error: "Only picked/completed orders can be assigned for delivery",
      status: 400,
    };
  }

  if (
    order.delivery_status &&
    !["ready_for_delivery", "failed", "cancelled"].includes(order.delivery_status)
  ) {
    return {
      error: `Order delivery status is "${order.delivery_status}" — cannot assign rider`,
      status: 400,
    };
  }

  if (replace_active) {
    await DeliveryAssignment.updateMany(
      {
        orders_idorders: orderId,
        status: { $in: ["assigned", "out_for_delivery"] },
      },
      { status: "cancelled" }
    );
  }

  const activeDelivery = await DeliveryAssignment.findOne({
    orders_idorders: orderId,
    status: { $in: ["assigned", "out_for_delivery"] },
  });
  if (activeDelivery) {
    return {
      error: "Order already has an active delivery assignment",
      status: 409,
    };
  }

  const rider = await findRiderForStore({
    rider_id,
    rider_email,
    storeCode: order.store_code,
  });
  if (!rider) {
    return { error: "Rider not found for this store", status: 404 };
  }

  const assignment = await DeliveryAssignment.create({
    orders_idorders: orderId,
    store_code: order.store_code,
    project_code: order.project_code,
    rider_id: rider._id,
    assigned_by,
    status: "assigned",
  });

  await Order.updateOne(
    { orders_idorders: orderId },
    {
      $set: {
        delivery_status: "assigned",
        current_delivery_assignment_id: assignment._id,
      },
      // Count this dispatch as attempt 1 (never lowers a re-attempt count).
      $max: { delivery_attempts: 1 },
    }
  );

  if (notify) {
    sendToUser(
      rider._id,
      "New delivery assigned",
      `Order #${orderId} (${order.store_code}) assigned to you.`,
      {
        orders_idorders: String(orderId),
        store_code: order.store_code,
        assignment_id: String(assignment._id),
      },
      NOTIFICATION_TYPES.DELIVERY_ASSIGNED
    ).catch((e) => console.error("assignRiderToOrder notify failed:", e.message));
  }

  const populated = await DeliveryAssignment.findById(assignment._id).populate(
    "rider_id",
    "name email phone rider_availability"
  );

  return { assignment: populated, rider, order };
}

module.exports = {
  assignRiderToOrder,
  findRiderForStore,
};
