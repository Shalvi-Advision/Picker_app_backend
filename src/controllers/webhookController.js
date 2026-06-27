const mongoose = require("mongoose");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const WebhookLog = require("../models/WebhookLog");
const ProjectStore = require("../models/ProjectStore");
const { assignOrder } = require("../services/roundRobinService");
const { notifyManagersOfNewOrder } = require("../services/notificationService");

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toNullableString = (v) =>
  v === undefined || v === null || v === "" || v === "null" ? null : String(v);

const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(String(v).replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
};

function callerIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

async function log(fields) {
  try {
    await WebhookLog.create(fields);
  } catch (e) {
    console.error("[webhook-log] failed to save log:", e.message);
  }
}

/**
 * POST /api/webhook/order
 */
exports.receiveOrder = async (req, res) => {
  const ip = callerIp(req);

  // 1. Authenticate
  if (!WEBHOOK_SECRET) {
    await log({ status: "error", error_message: "Webhook secret not configured on server", caller_ip: ip });
    return res.status(500).json({ success: false, message: "Webhook secret not configured on server" });
  }
  const incoming = req.headers["x-webhook-secret"];
  if (!incoming || incoming !== WEBHOOK_SECRET) {
    await log({ status: "auth_failed", error_message: "Invalid or missing X-Webhook-Secret", caller_ip: ip });
    return res.status(401).json({ success: false, message: "Invalid or missing X-Webhook-Secret" });
  }

  // 2. Validate required fields
  const {
    project_code,
    store_code,
    orders_idorders: rawId,
    order_date,
    delivery_date,
    delivery_slot,
    delivery_details,
    latitude,
    longitude,
    items,
  } = req.body;

  if (!project_code || !store_code) {
    await log({ status: "validation_failed", error_message: "project_code and store_code are required", caller_ip: ip });
    return res.status(400).json({ success: false, message: "project_code and store_code are required" });
  }
  if (!rawId) {
    await log({ status: "validation_failed", store_code, project_code, error_message: "orders_idorders is required", caller_ip: ip });
    return res.status(400).json({ success: false, message: "orders_idorders is required" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    await log({ status: "validation_failed", store_code, project_code, error_message: "items array is required and must not be empty", caller_ip: ip });
    return res.status(400).json({ success: false, message: "items array is required and must not be empty" });
  }

  const orders_idorders = Number(rawId);
  if (!Number.isFinite(orders_idorders)) {
    await log({ status: "validation_failed", store_code, project_code, error_message: "orders_idorders must be a number", caller_ip: ip });
    return res.status(400).json({ success: false, message: "orders_idorders must be a number" });
  }

  // 3. Idempotency — skip if order already exists
  const existing = await Order.findOne({ orders_idorders }).lean();
  if (existing) {
    await log({ status: "skipped", orders_idorders, store_code, project_code, items_count: items.length, caller_ip: ip });
    return res.json({
      success: true,
      message: "Order already exists — skipped",
      already_exists: true,
      orders_idorders,
    });
  }

  // 4. Build and insert order + items
  try {
    const parsedDate = parseDate(order_date);
    const totalAmount = items.reduce((sum, i) => sum + toNumber(i.total_amt_our_price), 0);

    await Order.create({
      orders_idorders,
      store_code: String(store_code).toUpperCase(),
      project_code: String(project_code).toUpperCase(),
      order_date: parsedDate,
      delivery_date: toNullableString(delivery_date),
      delivery_slot: toNullableString(delivery_slot),
      delivery_details: toNullableString(delivery_details),
      latitude: toNullableString(latitude),
      longitude: toNullableString(longitude),
      total_items: items.length,
      total_amount: Math.round(totalAmount * 100) / 100,
      status: "pending",
      synced_at: new Date(),
    });

    const orderItems = items.map((item) => ({
      _id: new mongoose.Types.ObjectId().toString(),
      orders_idorders,
      store_code: String(store_code).toUpperCase(),
      project_code: String(project_code).toUpperCase(),
      order_date: parsedDate,
      delivery_date: toNullableString(delivery_date),
      delivery_details: toNullableString(delivery_details),
      latitude: toNullableString(latitude),
      longitude: toNullableString(longitude),
      department_name: item.department_name || null,
      category_name: item.category_name || null,
      sub_category_name: item.sub_category_name || null,
      p_code: item.p_code || null,
      barcode: item.barcode || null,
      item_name: item.item_name || "",
      product_description: item.product_description || null,
      pack_size: item.pack_size || null,
      ordered_quantity: toNumber(item.ordered_quantity),
      product_offer_price: toNumber(item.product_offer_price),
      product_mrp: toNumber(item.product_mrp),
      total_amt_our_price: toNumber(item.total_amt_our_price),
      total_amt_mrp: toNumber(item.total_amt_mrp),
      sell_rate_with_discount: toNumber(item.sell_rate_with_discount),
      pcode_img: toNullableString(item.pcode_img),
      product_picked_status: "Pending",
      synced_at: new Date(),
    }));

    await OrderItem.insertMany(orderItems);

    // 5. Notify managers the order arrived (fire-and-forget — runs before assignment
    //    so managers are informed even if round-robin later finds no active picker).
    notifyManagersOfNewOrder({
      orders_idorders,
      store_code: String(store_code).toUpperCase(),
      total_items: items.length,
      total_amount: Math.round(totalAmount * 100) / 100,
    }).catch((e) => console.error("[webhook] notifyManagersOfNewOrder failed:", e.message));

    // 7. Auto-register project+store mapping if it doesn't exist yet
    await ProjectStore.updateOne(
      { project_code: String(project_code).toUpperCase(), store_code: String(store_code).toUpperCase() },
      { $setOnInsert: { project_code: String(project_code).toUpperCase(), store_code: String(store_code).toUpperCase() } },
      { upsert: true }
    );

    // 8. Auto-assign
    let assignment = null;
    let assignError = null;
    try {
      assignment = await assignOrder(orders_idorders, store_code.toUpperCase(), project_code.toUpperCase(), null);
    } catch (err) {
      assignError = err.message;
      console.warn(`[webhook] auto-assign failed for order ${orders_idorders}:`, err.message);
    }

    await log({
      status: "success",
      orders_idorders,
      store_code: String(store_code).toUpperCase(),
      project_code: String(project_code).toUpperCase(),
      items_count: items.length,
      assigned: !!assignment,
      assign_error: assignError || null,
      caller_ip: ip,
    });

    return res.status(201).json({
      success: true,
      orders_idorders,
      items_inserted: orderItems.length,
      assigned: !!assignment,
      assign_error: assignError || undefined,
    });
  } catch (err) {
    await log({
      status: "error",
      orders_idorders,
      store_code: store_code ? String(store_code).toUpperCase() : null,
      project_code: project_code ? String(project_code).toUpperCase() : null,
      items_count: items?.length || 0,
      error_message: err.message,
      caller_ip: ip,
    });
    console.error("[webhook] error processing order:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
