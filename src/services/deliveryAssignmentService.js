const DeliveryAssignment = require("../models/DeliveryAssignment");
const Order = require("../models/Order");
const PickerUser = require("../models/PickerUser");
const { sendToUser } = require("./notificationService");
const { NOTIFICATION_TYPES } = require("../constants/notificationTypes");
const { pickNextRider } = require("./riderRoundRobinService");

async function findRiderForStore({ rider_id, rider_email, storeCode, projectCode }) {
  const filter = { role: "rider", is_active: true };
  if (rider_id) filter._id = rider_id;
  else if (rider_email) filter.email = String(rider_email).toLowerCase().trim();
  else return null;

  if (projectCode) filter.project_code = String(projectCode).toUpperCase();

  const rider = await PickerUser.findOne(filter);
  if (!rider) return null;
  if (storeCode && !rider.store_codes.includes(String(storeCode).toUpperCase())) return null;
  return rider;
}

/**
 * Assign a rider to an order (creates DeliveryAssignment + updates Order).
 * Default for webhooks: use_round_robin — picks next rider for order.store_code + order.project_code.
 */
async function assignRiderToOrder({
  orders_idorders,
  store_code,
  project_code,
  rider_id,
  rider_email,
  use_round_robin = false,
  assigned_by = null,
  notify = true,
  prepare_order = false,
  replace_active = false,
  reopen_cancelled = false,
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

  const storeCode = String(store_code || order.store_code).toUpperCase();
  const projectCode = String(project_code || order.project_code).toUpperCase();

  if (store_code || project_code) {
    if (order.store_code !== storeCode || order.project_code !== projectCode) {
      return {
        error: "store_code/project_code do not match order record",
        status: 400,
      };
    }
  }

  if (order.status === "cancelled" || order.delivery_status === "cancelled") {
    if (!reopen_cancelled) {
      return { error: "Order is cancelled — set reopen_cancelled to assign again", status: 409 };
    }
    await Order.updateOne(
      { orders_idorders: orderId },
      { status: "completed", delivery_status: "ready_for_delivery" }
    );
    order.status = "completed";
    order.delivery_status = "ready_for_delivery";
  }

  if (prepare_order || order.status !== "completed") {
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

  if (order.delivery_status === "delivered") {
    return { error: "Order is already delivered", status: 409 };
  }

  if (replace_active) {
    await DeliveryAssignment.updateMany(
      {
        orders_idorders: orderId,
        status: { $in: ["assigned", "out_for_delivery"] },
      },
      { status: "cancelled" }
    );
    if (["assigned", "out_for_delivery"].includes(order.delivery_status)) {
      await Order.updateOne(
        { orders_idorders: orderId },
        { delivery_status: "ready_for_delivery", current_delivery_assignment_id: null, current_route_id: null }
      );
      order.delivery_status = "ready_for_delivery";
    }
  }

  if (
    order.delivery_status &&
    !["ready_for_delivery", "failed", "cancelled", null].includes(order.delivery_status)
  ) {
    return {
      error: `Order delivery status is "${order.delivery_status}" — cannot assign rider`,
      status: 400,
    };
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

  let rider = null;
  let roundRobinMeta = null;

  if (use_round_robin) {
    const picked = await pickNextRider(storeCode, projectCode);
    if (picked.error) {
      return { error: picked.error, status: picked.status || 404 };
    }
    rider = picked.rider;
    roundRobinMeta = {
      rider_index: picked.rider_index,
      riders_in_pool: picked.riders_in_pool,
      store_code: storeCode,
      project_code: projectCode,
    };
  } else {
    if (!rider_id && !rider_email) {
      return { error: "rider_id or rider_email is required when not using round robin", status: 400 };
    }
    rider = await findRiderForStore({
      rider_id,
      rider_email,
      storeCode,
      projectCode,
    });
    if (!rider) {
      return { error: "Rider not found for this store and project", status: 404 };
    }
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
        project_code: order.project_code,
        assignment_id: String(assignment._id),
      },
      NOTIFICATION_TYPES.DELIVERY_ASSIGNED
    ).catch((e) => console.error("assignRiderToOrder notify failed:", e.message));
  }

  const populated = await DeliveryAssignment.findById(assignment._id).populate(
    "rider_id",
    "name email phone rider_availability"
  );

  return { assignment: populated, rider, order, round_robin: roundRobinMeta };
}

module.exports = {
  assignRiderToOrder,
  findRiderForStore,
};
