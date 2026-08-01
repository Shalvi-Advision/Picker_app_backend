/**
 * Read-only audit: find webhook "skipped" order_receive events whose order does
 * NOT actually exist for that (project_code, orders_idorders) — i.e. orders that
 * were wrongly skipped due to the cross-project id collision bug.
 *
 * Purely diagnostic. Writes nothing. Run:
 *   node audit-skipped-orders.js
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
  console.log("Connected to Picker DB\n");

  const logs = mongoose.connection.collection("webhook_logs");
  const orders = mongoose.connection.collection("orders");

  const skipped = await logs
    .find({ event_type: "order_receive", status: "skipped" })
    .sort({ createdAt: 1 })
    .toArray();

  console.log(`Total "skipped" order_receive log entries: ${skipped.length}\n`);

  const wronglySkipped = []; // no order exists for this (project, id)
  const legitDuplicates = []; // order really does exist for this (project, id)

  for (const s of skipped) {
    if (s.orders_idorders == null || !s.project_code) {
      // Can't verify without both keys; treat as unknown but surface it.
      wronglySkipped.push({ ...s, _reason: "missing project_code/id in log" });
      continue;
    }
    const exists = await orders.findOne({
      orders_idorders: s.orders_idorders,
      project_code: String(s.project_code).toUpperCase(),
    });
    if (exists) {
      legitDuplicates.push(s);
    } else {
      wronglySkipped.push(s);
    }
  }

  console.log(`Legitimately skipped (order genuinely already existed): ${legitDuplicates.length}`);
  console.log(`WRONGLY skipped (no order exists for that project+id): ${wronglySkipped.length}\n`);

  if (wronglySkipped.length) {
    console.log("=== Wrongly-skipped orders (never stored) ===");
    console.log("date\t\t\tproject\tstore\torder_id\titems\tcaller_ip");
    for (const w of wronglySkipped) {
      const d = w.createdAt ? new Date(w.createdAt).toISOString() : "?";
      console.log(
        `${d}\t${w.project_code || "?"}\t${w.store_code || "?"}\t${w.orders_idorders ?? "?"}\t${w.items_count ?? "?"}\t${w.caller_ip || "?"}${w._reason ? "\t<" + w._reason + ">" : ""}`
      );
    }
    // Group by project for a quick summary
    const byProject = {};
    for (const w of wronglySkipped) {
      const p = w.project_code || "UNKNOWN";
      byProject[p] = (byProject[p] || 0) + 1;
    }
    console.log("\n=== Summary by project ===");
    for (const [p, n] of Object.entries(byProject)) console.log(`  ${p}: ${n}`);
  }

  await mongoose.disconnect();
  console.log("\nDone. (No data was modified.)");
}

run().catch(async (e) => {
  console.error("Audit failed:", e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
