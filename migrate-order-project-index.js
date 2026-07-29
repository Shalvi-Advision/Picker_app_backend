/**
 * Migration: order id is unique PER PROJECT, not globally.
 *
 * The `orders` collection historically had a global unique index on
 * `orders_idorders`. That is wrong: two different projects legitimately reuse
 * the same numeric order id, and the old index made the webhook skip / reject
 * the second project's order (or fail on a duplicate-key error).
 *
 * This script:
 *   1. Drops any single-field unique index on `orders_idorders`.
 *   2. Creates the compound unique index `{ project_code: 1, orders_idorders: 1 }`.
 *
 * It is idempotent — safe to run more than once.
 *
 * Run once against each environment BEFORE relying on the new webhook behavior:
 *   node migrate-order-project-index.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  const uri = process.env.PICKER_MONGO_URI;
  if (!uri) {
    console.error("PICKER_MONGO_URI is not set. Aborting.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to Picker DB");

  const coll = mongoose.connection.collection("orders");

  const indexes = await coll.indexes();
  console.log(
    "Existing indexes:",
    indexes.map((i) => `${i.name} => ${JSON.stringify(i.key)}${i.unique ? " (unique)" : ""}`)
  );

  // 1. Drop any single-field index keyed only on orders_idorders (e.g. the old
  //    unique "orders_idorders_1"). We never drop _id_.
  for (const idx of indexes) {
    const keys = Object.keys(idx.key);
    const isSingleOrderId = keys.length === 1 && keys[0] === "orders_idorders";
    if (isSingleOrderId && idx.name !== "_id_") {
      console.log(`Dropping stale index "${idx.name}" ...`);
      await coll.dropIndex(idx.name);
      console.log(`  dropped ${idx.name}`);
    }
  }

  // 2. Create the compound unique index that reflects the true identity.
  //    If duplicates exist across the SAME project (a real data problem), this
  //    throws — the error message lists the offending key so it can be fixed.
  try {
    await coll.createIndex(
      { project_code: 1, orders_idorders: 1 },
      { unique: true, name: "project_code_1_orders_idorders_1" }
    );
    console.log("Created compound unique index { project_code, orders_idorders }");
  } catch (e) {
    console.error(
      "Failed to create compound unique index — likely a genuine duplicate " +
        "(same project_code + orders_idorders exists twice). Resolve it, then re-run."
    );
    console.error(e.message);
    await mongoose.disconnect();
    process.exit(1);
  }

  const after = await coll.indexes();
  console.log(
    "Indexes after migration:",
    after.map((i) => `${i.name} => ${JSON.stringify(i.key)}${i.unique ? " (unique)" : ""}`)
  );

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch(async (e) => {
  console.error("Migration failed:", e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
