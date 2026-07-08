const Order = require("../models/Order");
const WebhookLog = require("../models/WebhookLog");

/**
 * Syncs delivered orders to the upstream e-commerce system
 * (POST {project_code, store_code, order_id} to RIDER_DELIVERED_API_URL).
 *
 * Outbox pattern: marking an order delivered sets upstream_sync.status to
 * "pending" in the same DB update. syncDeliveredOrder() is fired right away
 * for a near-instant push; the background worker retries anything still
 * pending (upstream down, server restarted mid-sync) until it succeeds or
 * MAX_ATTEMPTS is reached. Re-posts are safe — the API is keyed by order_id.
 *
 * Env: RIDER_DELIVERED_API_URL (required to enable),
 *      RIDER_DELIVERED_API_KEY (optional, sent as X-Api-Key).
 */

const MAX_ATTEMPTS = 10;
const REQUEST_TIMEOUT_MS = 10_000;
const WORKER_INTERVAL_MS = 2 * 60 * 1000;
const WORKER_BATCH_SIZE = 50;

function apiUrl() {
  return process.env.RIDER_DELIVERED_API_URL;
}

/** Audit trail — every attempt lands in webhook_logs (admin > Webhook Logs). */
function logAttempt(order, attempt, error) {
  WebhookLog.create({
    event_type: "rider_delivered",
    orders_idorders: order.orders_idorders,
    store_code: order.store_code,
    project_code: order.project_code,
    status: error ? "error" : "success",
    error_message: error || null,
    metadata: { direction: "outgoing", attempt, max_attempts: MAX_ATTEMPTS, api_url: apiUrl() },
  }).catch((e) => console.error("[upstream-sync] log write failed:", e.message));
}

async function postRiderDelivered(order) {
  const headers = { "Content-Type": "application/json" };
  if (process.env.RIDER_DELIVERED_API_KEY) {
    headers["X-Api-Key"] = process.env.RIDER_DELIVERED_API_KEY;
  }

  const res = await fetch(apiUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({
      project_code: order.project_code,
      store_code: order.store_code,
      order_id: order.orders_idorders,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

/**
 * Attempt one upstream sync for a delivered order. Safe to call repeatedly;
 * skips orders already synced or past the attempt cap.
 */
async function syncDeliveredOrder(ordersIdorders) {
  if (!apiUrl()) return { skipped: true };

  const order = await Order.findOne({
    orders_idorders: ordersIdorders,
    delivery_status: "delivered",
  });
  if (!order) return { skipped: true };

  const sync = order.upstream_sync || {};
  if (sync.status === "synced") return { ok: true, already: true };
  if ((sync.attempts || 0) >= MAX_ATTEMPTS) return { ok: false, exhausted: true };

  try {
    await postRiderDelivered(order);
    await Order.updateOne(
      { orders_idorders: ordersIdorders },
      {
        $set: {
          "upstream_sync.status": "synced",
          "upstream_sync.synced_at": new Date(),
          "upstream_sync.last_error": null,
        },
        $inc: { "upstream_sync.attempts": 1 },
      }
    );
    logAttempt(order, (sync.attempts || 0) + 1, null);
    console.log(`[upstream-sync] order #${ordersIdorders} synced`);
    return { ok: true };
  } catch (err) {
    const attempts = (sync.attempts || 0) + 1;
    await Order.updateOne(
      { orders_idorders: ordersIdorders },
      {
        $set: {
          "upstream_sync.status": attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          "upstream_sync.last_error": err.message,
        },
        $inc: { "upstream_sync.attempts": 1 },
      }
    );
    logAttempt(order, attempts, err.message);
    console.error(
      `[upstream-sync] order #${ordersIdorders} attempt ${attempts}/${MAX_ATTEMPTS} failed: ${err.message}`
    );
    return { ok: false, error: err.message };
  }
}

async function runSyncPass() {
  const pending = await Order.find({
    delivery_status: "delivered",
    "upstream_sync.status": "pending",
    "upstream_sync.attempts": { $lt: MAX_ATTEMPTS },
  })
    .sort({ updatedAt: 1 })
    .limit(WORKER_BATCH_SIZE)
    .select("orders_idorders");

  for (const o of pending) {
    await syncDeliveredOrder(o.orders_idorders);
  }
  return pending.length;
}

/**
 * Start the background retry loop. Call once after the DB is connected.
 */
function startUpstreamSyncWorker() {
  if (!apiUrl()) {
    console.warn("[upstream-sync] RIDER_DELIVERED_API_URL not set — sync disabled");
    return;
  }

  const tick = () =>
    runSyncPass().catch((e) => console.error("[upstream-sync] pass failed:", e.message));

  tick();
  setInterval(tick, WORKER_INTERVAL_MS);
  console.log(`[upstream-sync] worker started (every ${WORKER_INTERVAL_MS / 1000}s)`);
}

module.exports = { syncDeliveredOrder, startUpstreamSyncWorker };
