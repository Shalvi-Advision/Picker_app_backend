const Order = require("../models/Order");
const PickerUser = require("../models/PickerUser");

/**
 * Notify the upstream e-commerce system when an order is delivered.
 * Configure UPSTREAM_DELIVERY_WEBHOOK_URL (+ optional UPSTREAM_DELIVERY_WEBHOOK_SECRET).
 */
async function notifyUpstreamDelivered(order, assignment, rider) {
  const url = process.env.UPSTREAM_DELIVERY_WEBHOOK_URL;
  if (!url) return { skipped: true };

  const secret = process.env.UPSTREAM_DELIVERY_WEBHOOK_SECRET || "";
  const pod = assignment.proof_of_delivery || {};

  const payload = {
    event: "order_delivered",
    orders_idorders: order.orders_idorders,
    store_code: order.store_code,
    project_code: order.project_code,
    delivery_status: "delivered",
    delivered_at: assignment.delivered_at?.toISOString() || new Date().toISOString(),
    rider: {
      id: String(rider._id),
      name: rider.name || null,
      phone: rider.phone || null,
    },
    proof_of_delivery: {
      photo_urls: pod.photo_urls || [],
      signature_url: pod.signature_url || null,
      recipient_name: pod.recipient_name || null,
      notes: pod.notes || null,
      latitude: pod.latitude || null,
      longitude: pod.longitude || null,
    },
  };

  const headers = { "Content-Type": "application/json" };
  if (secret) headers["X-Webhook-Secret"] = secret;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[upstream-delivery] ${order.orders_idorders} failed: HTTP ${res.status} ${text.slice(0, 200)}`
      );
      return { ok: false, status: res.status };
    }
    console.log(`[upstream-delivery] notified for order #${order.orders_idorders}`);
    return { ok: true };
  } catch (err) {
    console.error(`[upstream-delivery] ${order.orders_idorders} error:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { notifyUpstreamDelivered };
