/**
 * Read-only: for each affected project, fetch the upstream pending-orders feed
 * and report which of our wrongly-skipped order ids are STILL available upstream
 * (i.e. recoverable) vs gone.
 *
 * Writes nothing. Run:
 *   node audit-recoverable-orders.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

const SOURCE_URL =
  process.env.SOURCE_ORDERS_API_URL ||
  "https://picker.shalviadvision.com/api/get_project_pending_orders";

async function fetchPending(project_code) {
  const res = await fetch(SOURCE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_code }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("upstream did not return an array");
  return data;
}

async function run() {
  const uri = process.env.PICKER_MONGO_URI;
  if (!uri) { console.error("PICKER_MONGO_URI not set"); process.exit(1); }
  await mongoose.connect(uri);
  console.log("Connected to Picker DB\n");

  const logs = mongoose.connection.collection("webhook_logs");
  const orders = mongoose.connection.collection("orders");

  // Rebuild the wrongly-skipped set (skip logs whose order still doesn't exist).
  const skipped = await logs
    .find({ event_type: "order_receive", status: "skipped" })
    .toArray();

  const wrongByProject = {}; // project -> Set(order_id)
  for (const s of skipped) {
    if (s.orders_idorders == null || !s.project_code) continue;
    const pc = String(s.project_code).toUpperCase();
    const exists = await orders.findOne({ orders_idorders: s.orders_idorders, project_code: pc });
    if (!exists) (wrongByProject[pc] ||= new Set()).add(s.orders_idorders);
  }

  const projects = Object.keys(wrongByProject).sort();
  console.log(`Affected projects: ${projects.join(", ")}\n`);

  let totalRecoverable = 0;
  let totalGone = 0;
  const recoverable = {}; // project -> [ids]
  const gone = {};        // project -> [ids]

  for (const pc of projects) {
    let rows;
    try {
      rows = await fetchPending(pc);
    } catch (e) {
      console.log(`[${pc}] upstream fetch FAILED: ${e.message}`);
      continue;
    }
    const upstreamIds = new Set(rows.map((r) => Number(r.orders_idorders)));
    const wanted = [...wrongByProject[pc]];
    const rec = wanted.filter((id) => upstreamIds.has(id)).sort((a, b) => a - b);
    const missing = wanted.filter((id) => !upstreamIds.has(id)).sort((a, b) => a - b);
    recoverable[pc] = rec;
    gone[pc] = missing;
    totalRecoverable += rec.length;
    totalGone += missing.length;
    console.log(
      `[${pc}] wrongly-skipped=${wanted.length}  upstream_pending_rows=${rows.length}  recoverable=${rec.length}  gone=${missing.length}`
    );
    if (rec.length) console.log(`   recoverable ids: ${rec.join(", ")}`);
    if (missing.length) console.log(`   gone ids:        ${missing.join(", ")}`);
  }

  console.log(`\n=== TOTAL recoverable now (still pending upstream): ${totalRecoverable} ===`);
  console.log(`=== TOTAL gone (no longer in upstream pending feed): ${totalGone} ===`);

  await mongoose.disconnect();
  console.log("\nDone. (No data was modified.)");
}

run().catch(async (e) => {
  console.error("Audit failed:", e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
