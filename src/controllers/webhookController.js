const mongoose = require("mongoose");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const { assignOrder } = require("../services/roundRobinService");

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

// Helpers (same logic as orderSyncService)
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

/**
 * POST /api/webhook/order
 *
 * Called by the upstream e-commerce system the moment a new order is placed.
 * Handles any project_code + store_code combination — no hardcoding.
 *
 * Required header:  X-Webhook-Secret: <WEBHOOK_SECRET>
 *
 * Body shape:
 * {
 *   project_code: "RET3163",
 *   store_code:   "STORE001",
 *   orders_idorders: 12345,
 *   order_date:   "2026-06-03T10:30:00",   // optional
 *   delivery_date: "2026-06-04",            // optional
 *   delivery_details: "Leave at door",      // optional
 *   latitude:  "19.0760",                   // optional
 *   longitude: "72.8777",                   // optional
 *   items: [
 *     {
 *       p_code, barcode, item_name,
 *       department_name, category_name, sub_category_name,
 *       product_description, pack_size,
 *       ordered_quantity,
 *       product_offer_price, product_mrp,
 *       total_amt_our_price, total_amt_mrp,
 *       sell_rate_with_discount,
 *       pcode_img
 *     }
 *   ]
 * }
 */
exports.receiveOrder = async (req, res) => {
  // 1. Authenticate the caller.
  if (!WEBHOOK_SECRET) {
    return res.status(500).json({ success: false, message: "Webhook secret not configured on server" });
  }
  const incoming = req.headers["x-webhook-secret"];
  if (!incoming || incoming !== WEBHOOK_SECRET) {
    return res.status(401).json({ success: false, message: "Invalid or missing X-Webhook-Secret" });
  }

  // 2. Validate required fields.
  const {
    project_code,
    store_code,
    orders_idorders: rawId,
    order_date,
    delivery_date,
    delivery_details,
    latitude,
    longitude,
    items,
  } = req.body;

  if (!project_code || !store_code) {
    return res.status(400).json({ success: false, message: "project_code and store_code are required" });
  }
  if (!rawId) {
    return res.status(400).json({ success: false, message: "orders_idorders is required" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "items array is required and must not be empty" });
  }

  const orders_idorders = Number(rawId);
  if (!Number.isFinite(orders_idorders)) {
    return res.status(400).json({ success: false, message: "orders_idorders must be a number" });
  }

  // 3. Idempotency — skip if order already exists.
  const existing = await Order.findOne({ orders_idorders }).lean();
  if (existing) {
    return res.json({
      success: true,
      message: "Order already exists — skipped",
      already_exists: true,
      orders_idorders,
    });
  }

  // 4. Build and insert order + items.
  const parsedDate = parseDate(order_date);
  const totalAmount = items.reduce((sum, i) => sum + toNumber(i.total_amt_our_price), 0);

  await Order.create({
    orders_idorders,
    store_code: String(store_code).toUpperCase(),
    project_code: String(project_code).toUpperCase(),
    order_date: parsedDate,
    delivery_date: toNullableString(delivery_date),
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

  // 5. Auto-assign via round-robin → fires push notifications immediately.
  let assignment = null;
  let assignError = null;
  try {
    assignment = await assignOrder(orders_idorders, store_code.toUpperCase(), project_code.toUpperCase(), null);
  } catch (err) {
    assignError = err.message;
    console.warn(`[webhook] auto-assign failed for order ${orders_idorders}:`, err.message);
  }

  return res.status(201).json({
    success: true,
    orders_idorders,
    items_inserted: orderItems.length,
    assigned: !!assignment,
    assign_error: assignError || undefined,
  });
};
