/**
 * One-off cleanup: fully remove a single order (and everything derived from it)
 * so it can be re-tested after the upstream integration fix.
 *
 * Target: orders_idorders=93037, project_code=RET3163  (store BLEB)
 *
 * Order ids are only unique WITHIN a project, so every delete is scoped by
 * (project_code, orders_idorders). The two picker sub-collections that don't
 * carry project_code (picker_item_status, picker_escalations) are scoped by the
 * assignment_ids belonging to this order — never by orders_idorders alone —
 * so a same-id order in another project can't be touched.
 *
 * DRY-RUN by default. To actually delete:  node delete-order-93037.js --confirm
 */
require("dotenv").config();
const mongoose = require("mongoose");

const ORDER_ID = 93037;
const PROJECT_CODE = "RET3163";
const CONFIRM = process.argv.includes("--confirm");

async function run() {
  const uri = process.env.PICKER_MONGO_URI;
  if (!uri) {
    console.error("PICKER_MONGO_URI is not set. Aborting.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  const db = mongoose.connection;
  console.log(`Connected to Picker DB\n`);
  console.log(`Target order: orders_idorders=${ORDER_ID}, project_code=${PROJECT_CODE}`);
  console.log(CONFIRM ? "MODE: DELETE (--confirm passed)\n" : "MODE: DRY-RUN (pass --confirm to delete)\n");

  const scoped = { orders_idorders: ORDER_ID, project_code: PROJECT_CODE };

  // Find assignment ids for this order first — used to scope the two
  // sub-collections that lack project_code.
  const pickerAssignments = await db
    .collection("picker_assignments")
    .find(scoped, { projection: { _id: 1 } })
    .toArray();
  const assignmentIds = pickerAssignments.map((a) => a._id);

  // (collection name, filter) for every place this order leaves a row.
  const targets = [
    ["orders", scoped],
    ["order_items", scoped],
    ["picker_assignments", scoped],
    ["delivery_assignments", scoped],
    ["delivery_routes", scoped],
    ["picker_item_status", assignmentIds.length ? { assignment_id: { $in: assignmentIds } } : null],
    ["picker_escalations", assignmentIds.length ? { assignment_id: { $in: assignmentIds } } : null],
  ];

  let grandTotal = 0;
  for (const [name, filter] of targets) {
    if (!filter) {
      console.log(`  ${name.padEnd(22)} : 0 (no assignments to scope by — skipped)`);
      continue;
    }
    const coll = db.collection(name);
    const count = await coll.countDocuments(filter);
    grandTotal += count;
    if (CONFIRM && count > 0) {
      const res = await coll.deleteMany(filter);
      console.log(`  ${name.padEnd(22)} : matched ${count}, deleted ${res.deletedCount}`);
    } else {
      console.log(`  ${name.padEnd(22)} : ${count} ${CONFIRM ? "" : "would delete"}`);
    }
  }

  console.log(`\nTotal documents ${CONFIRM ? "deleted" : "that would be deleted"}: ${grandTotal}`);
  if (!CONFIRM) console.log("\nNothing was modified. Re-run with --confirm to delete.");
  else console.log("\nDone. Order fully removed — safe to re-send the webhook and re-test.");

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error("Cleanup failed:", e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
