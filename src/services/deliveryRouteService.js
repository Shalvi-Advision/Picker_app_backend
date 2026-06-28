const DeliveryRoute = require("../models/DeliveryRoute");
const DeliveryAssignment = require("../models/DeliveryAssignment");
const Order = require("../models/Order");

async function syncRouteProgress(routeId) {
  if (!routeId) return null;

  const route = await DeliveryRoute.findById(routeId);
  if (!route || route.status === "cancelled") return route;

  const assignments = await DeliveryAssignment.find({ route_id: routeId }).lean();
  const byOrder = Object.fromEntries(assignments.map((a) => [a.orders_idorders, a]));

  let changed = false;
  for (const stop of route.stops) {
    const a = byOrder[stop.orders_idorders];
    if (!a) continue;
    let next = stop.status;
    if (a.status === "delivered") next = "delivered";
    else if (a.status === "failed" || a.status === "cancelled") next = "failed";
    else if (a.status === "out_for_delivery" || a.status === "assigned") next = "pending";
    if (next !== stop.status) {
      stop.status = next;
      changed = true;
    }
  }

  const allDone = route.stops.every((s) =>
    ["delivered", "failed", "cancelled"].includes(s.status)
  );
  const anyStarted = assignments.some((a) =>
    ["out_for_delivery", "delivered", "failed"].includes(a.status)
  );

  if (anyStarted && route.status === "planned") {
    route.status = "in_progress";
    route.started_at = route.started_at || new Date();
    changed = true;
  }
  if (allDone && route.status !== "completed") {
    route.status = "completed";
    route.completed_at = new Date();
    changed = true;
  }

  if (changed) await route.save();
  return route;
}

async function onAssignmentStarted(assignment) {
  if (!assignment.route_id) return;
  await DeliveryRoute.updateOne(
    { _id: assignment.route_id, status: "planned" },
    { status: "in_progress", started_at: new Date() }
  );
}

async function onAssignmentFinished(assignment, orderDeliveryStatus) {
  if (!assignment.route_id) return;

  const stopStatus = orderDeliveryStatus === "delivered" ? "delivered" : "failed";
  await DeliveryRoute.updateOne(
    { _id: assignment.route_id, "stops.orders_idorders": assignment.orders_idorders },
    { $set: { "stops.$.status": stopStatus } }
  );

  await syncRouteProgress(assignment.route_id);
}

module.exports = {
  syncRouteProgress,
  onAssignmentStarted,
  onAssignmentFinished,
};
