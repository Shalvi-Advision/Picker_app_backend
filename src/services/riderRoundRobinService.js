const RoundRobinState = require("../models/RoundRobinState");
const PickerUser = require("../models/PickerUser");

/**
 * Next rider via round-robin for a store + project (same pattern as picker assignment).
 * Only active, online riders scoped to the order's store and project.
 */
async function pickNextRider(store_code, project_code) {
  const storeCode = String(store_code).toUpperCase();
  const projectCode = String(project_code).toUpperCase();

  const activeRiders = await PickerUser.find({
    role: "rider",
    store_codes: storeCode,
    project_code: projectCode,
    is_active: true,
    rider_availability: { $ne: "offline" },
  })
    .sort({ _id: 1 })
    .select("_id name email");

  if (activeRiders.length === 0) {
    return {
      error: `No active riders for store ${storeCode} (${projectCode})`,
      status: 404,
    };
  }

  const state =
    (await RoundRobinState.findOne({ store_code: storeCode, project_code: projectCode })) ||
    (await RoundRobinState.create({
      store_code: storeCode,
      project_code: projectCode,
      last_assigned_picker_index: -1,
      last_assigned_rider_index: -1,
      picker_queue: [],
    }));

  const nextIndex = (state.last_assigned_rider_index + 1) % activeRiders.length;
  const rider = activeRiders[nextIndex];

  await RoundRobinState.updateOne(
    { store_code: storeCode, project_code: projectCode },
    { last_assigned_rider_index: nextIndex, updated_at: new Date() }
  );

  return {
    rider: await PickerUser.findById(rider._id),
    rider_index: nextIndex,
    riders_in_pool: activeRiders.length,
  };
}

module.exports = { pickNextRider };
