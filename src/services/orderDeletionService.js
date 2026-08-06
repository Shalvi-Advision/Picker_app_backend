const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const PickerAssignment = require("../models/PickerAssignment");
const DeliveryAssignment = require("../models/DeliveryAssignment");
const DeliveryRoute = require("../models/DeliveryRoute");
const PickerItemStatus = require("../models/PickerItemStatus");
const PickerEscalation = require("../models/PickerEscalation");

/**
 * Permanently delete an order and everything derived from it.
 *
 * Order ids are unique per project only, so every delete is scoped by
 * (project_code, orders_idorders). The two picker sub-collections that don't
 * carry project_code (picker_item_status, picker_escalations) are scoped by the
 * assignment_ids belonging to this order — never by orders_idorders alone — so a
 * same-id order in another project can't be touched.
 *
 * This is a hard delete (unlike cancelOrderFromUpstream which flips status
 * flags). Intended for super-admin cleanup of bad/test orders.
 */
async function deleteOrderCompletely({ orders_idorders, project_code }) {
  const orderId = Number(orders_idorders);
  if (!Number.isFinite(orderId)) {
    return { error: "orders_idorders must be a number", status: 400 };
  }
  if (!project_code) {
    return { error: "project_code is required", status: 400 };
  }

  const projectCode = String(project_code).toUpperCase();
  const scope = { orders_idorders: orderId, project_code: projectCode };

  const order = await Order.findOne(scope).lean();
  if (!order) {
    return { error: "Order not found", status: 404 };
  }

  // Assignment ids scope the two child collections that lack project_code.
  const assignments = await PickerAssignment.find(scope).select("_id").lean();
  const assignmentIds = assignments.map((a) => a._id);
  const childScope = assignmentIds.length ? { assignment_id: { $in: assignmentIds } } : null;

  const [
    itemStatus,
    escalations,
    orderItems,
    pickerAssignments,
    deliveryAssignments,
    deliveryRoutes,
  ] = await Promise.all([
    childScope ? PickerItemStatus.deleteMany(childScope) : Promise.resolve({ deletedCount: 0 }),
    childScope ? PickerEscalation.deleteMany(childScope) : Promise.resolve({ deletedCount: 0 }),
    OrderItem.deleteMany(scope),
    PickerAssignment.deleteMany(scope),
    DeliveryAssignment.deleteMany(scope),
    DeliveryRoute.deleteMany(scope),
  ]);

  // Delete the order record last, so a mid-way failure leaves the order visible
  // (and re-deletable) rather than orphaning children under a vanished order.
  const orderResult = await Order.deleteOne(scope);

  const deleted = {
    orders: orderResult.deletedCount || 0,
    order_items: orderItems.deletedCount || 0,
    picker_assignments: pickerAssignments.deletedCount || 0,
    delivery_assignments: deliveryAssignments.deletedCount || 0,
    delivery_routes: deliveryRoutes.deletedCount || 0,
    picker_item_status: itemStatus.deletedCount || 0,
    picker_escalations: escalations.deletedCount || 0,
  };
  deleted.total = Object.values(deleted).reduce((s, n) => s + n, 0);

  return {
    order: {
      orders_idorders: order.orders_idorders,
      project_code: order.project_code,
      store_code: order.store_code,
    },
    deleted,
  };
}

module.exports = { deleteOrderCompletely };
