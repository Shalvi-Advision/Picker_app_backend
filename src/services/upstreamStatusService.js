const ProjectStore = require("../models/ProjectStore");
const WebhookLog = require("../models/WebhookLog");

/**
 * Notifies an order's upstream e-commerce system of a status change, via
 * the per-(project_code, store_code) upstream_webhook_url/secret registered
 * on ProjectStore (see webhookController.receiveOrder) — the multi-tenant
 * counterpart to upstreamDeliveryService.js's single global
 * RIDER_DELIVERED_API_URL, which only ever served the one legacy caller.
 *
 * A no-op (returns { skipped: true }) for any order whose ProjectStore row
 * has no upstream_webhook_url — i.e. every order from a caller (like the
 * legacy Patel/RET3163 integration) that never registered one. That
 * caller's "delivered" notifications keep flowing through
 * upstreamDeliveryService.js exactly as before; this service never touches
 * or duplicates that path.
 */

const REQUEST_TIMEOUT_MS = 10_000;

function logAttempt({ order, event, error }) {
  WebhookLog.create({
    event_type: "upstream_status",
    orders_idorders: order.orders_idorders,
    store_code: order.store_code,
    project_code: order.project_code,
    status: error ? "error" : "success",
    error_message: error || null,
    metadata: { direction: "outgoing", event },
  }).catch((e) => console.error("[upstream-status] log write failed:", e.message));
}

/**
 * @param {object} order - an Order document (or plain object with
 *   orders_idorders/store_code/project_code/status/delivery_status).
 * @param {string} event - e.g. "picking_started", "out_for_delivery",
 *   "delivered", "cancelled". Sent through verbatim; Universal's receiver
 *   maps it to its own order_status.
 * @param {object} [extra] - additional fields to merge into the payload
 *   (e.g. { rider: {...} } for a rider-assigned notification).
 */
async function notifyUpstream(order, event, extra = {}) {
  const projectStore = await ProjectStore.findOne({
    project_code: order.project_code,
    store_code: order.store_code,
  }).lean();

  if (!projectStore?.upstream_webhook_url) {
    return { skipped: true, reason: "no_upstream_webhook_configured" };
  }

  const headers = { "Content-Type": "application/json" };
  if (projectStore.upstream_webhook_secret) {
    headers["X-Webhook-Secret"] = projectStore.upstream_webhook_secret;
  }

  const body = {
    event,
    orders_idorders: order.orders_idorders,
    project_code: order.project_code,
    store_code: order.store_code,
    status: order.status,
    delivery_status: order.delivery_status || null,
    updated_at: new Date().toISOString(),
    ...extra,
  };

  try {
    const res = await fetch(projectStore.upstream_webhook_url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    logAttempt({ order, event });
    return { ok: true };
  } catch (err) {
    console.error(`[upstream-status] order #${order.orders_idorders} event=${event} failed:`, err.message);
    logAttempt({ order, event, error: err.message });
    return { ok: false, error: err.message };
  }
}

/** True if this order's project/store has a per-tenant upstream webhook
 * registered — used by upstreamDeliveryService.js to avoid also posting
 * such orders to the legacy global RIDER_DELIVERED_API_URL. */
async function hasUpstreamWebhook(order) {
  const projectStore = await ProjectStore.findOne({
    project_code: order.project_code,
    store_code: order.store_code,
  })
    .select("upstream_webhook_url")
    .lean();
  return !!projectStore?.upstream_webhook_url;
}

module.exports = { notifyUpstream, hasUpstreamWebhook };
