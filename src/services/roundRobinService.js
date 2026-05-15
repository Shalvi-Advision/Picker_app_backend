const RoundRobinState = require("../models/RoundRobinState");
const PickerAssignment = require("../models/PickerAssignment");
const PickerUser = require("../models/PickerUser");
const Order = require("../models/Order");
const { sendToUser } = require("./notificationService");

const assignOrder = async (orders_idorders, store_code, project_code, assigned_by = null) => {
  // Build a fresh active-picker list each time so toggling is_active takes effect
  // immediately without needing to rebuild a persisted queue.
  const activePickers = await PickerUser.find({
    role: "picker",
    store_codes: store_code,
    project_code,
    is_active: true,
  })
    .sort({ _id: 1 })
    .select("_id");

  if (activePickers.length === 0) {
    throw new Error(`No active pickers for store ${store_code}`);
  }

  const state =
    (await RoundRobinState.findOne({ store_code, project_code })) ||
    (await RoundRobinState.create({
      store_code,
      project_code,
      last_assigned_picker_index: -1,
      picker_queue: [],
    }));

  const nextIndex = (state.last_assigned_picker_index + 1) % activePickers.length;
  const assignedTo = activePickers[nextIndex]._id;

  const assignment = await PickerAssignment.create({
    orders_idorders,
    store_code,
    project_code,
    assigned_to: assignedTo,
    assigned_by,
    assignment_round: nextIndex,
    status: "assigned",
    assigned_at: new Date(),
  });

  await RoundRobinState.updateOne(
    { store_code, project_code },
    { last_assigned_picker_index: nextIndex, updated_at: new Date() }
  );

  await Order.updateOne({ orders_idorders }, { status: "assigned" });

  await sendToUser(
    assignedTo,
    "New Order Assigned",
    `Order #${orders_idorders} has been assigned to you.`,
    { orders_idorders: String(orders_idorders), store_code },
    "order_assigned"
  );

  return assignment;
};

const reassignOrder = async (orders_idorders, new_picker_id, manager_id) => {
  // Look at most recent assignment regardless of status (rejected/assigned/in_progress)
  const current = await PickerAssignment.findOne({ orders_idorders }).sort({ assigned_at: -1 });

  if (!current) throw new Error("No prior assignment found for this order");

  // If the current one is still active, mark it as reassigned so it disappears from the prior picker's list
  if (["assigned", "in_progress"].includes(current.status)) {
    await PickerAssignment.updateOne(
      { _id: current._id },
      { status: "reassigned", reassigned_at: new Date() }
    );
  }

  const assignment = await PickerAssignment.create({
    orders_idorders,
    store_code: current.store_code,
    project_code: current.project_code,
    assigned_to: new_picker_id,
    assigned_by: manager_id,
    assignment_round: current.assignment_round,
    reassigned_from: current.assigned_to,
    reassigned_at: new Date(),
    status: "assigned",
    assigned_at: new Date(),
  });

  // Push order back to "assigned" since it now has an active picker
  await Order.updateOne({ orders_idorders }, { status: "assigned" });

  await sendToUser(
    new_picker_id,
    "Order Reassigned to You",
    `Order #${orders_idorders} has been reassigned to you.`,
    { orders_idorders: String(orders_idorders) },
    "order_assigned"
  );

  return assignment;
};

module.exports = { assignOrder, reassignOrder };
