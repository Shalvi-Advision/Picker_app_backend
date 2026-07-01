const mongoose = require("mongoose");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const WebhookLog = require("../models/WebhookLog");
const ProjectStore = require("../models/ProjectStore");
const { assignOrder } = require("../services/roundRobinService");
const { notifyManagersOfNewOrder } = require("../services/notificationService");
const { assignRiderToOrder } = require("../services/deliveryAssignmentService");
const { cancelOrderFromUpstream } = require("../services/orderCancellationService");

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

async function verifyWebhookAuth(req, res, ip, event_type = "order_receive") {
  if (!WEBHOOK_SECRET) {
    await log({
      status: "error",
      event_type,
      error_message: "Webhook secret not configured on server",
      caller_ip: ip,
    });
    res.status(500).json({ success: false, message: "Webhook secret not configured on server" });
    return false;
  }
  const incoming = req.headers["x-webhook-secret"];
  if (!incoming || incoming !== WEBHOOK_SECRET) {
    await log({
      status: "auth_failed",
      event_type,
      error_message: "Invalid or missing X-Webhook-Secret",
      caller_ip: ip,
    });
    res.status(401).json({ success: false, message: "Invalid or missing X-Webhook-Secret" });
    return false;
  }
  return true;
}

function parseOrderId(rawId) {
  const orders_idorders = Number(rawId);
  if (!Number.isFinite(orders_idorders)) return null;
  return orders_idorders;
}

/**
 * POST /api/webhook/order
 */
exports.receiveOrder = async (req, res) => {
  const ip = callerIp(req);
  const event_type = "order_receive";
  if (!(await verifyWebhookAuth(req, res, ip, event_type))) return;

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
    await log({ status: "validation_failed", event_type, error_message: "project_code and store_code are required", caller_ip: ip });
    return res.status(400).json({ success: false, message: "project_code and store_code are required" });
  }
  if (!rawId) {
    await log({ status: "validation_failed", event_type, store_code, project_code, error_message: "orders_idorders is required", caller_ip: ip });
    return res.status(400).json({ success: false, message: "orders_idorders is required" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    await log({ status: "validation_failed", event_type, store_code, project_code, error_message: "items array is required and must not be empty", caller_ip: ip });
    return res.status(400).json({ success: false, message: "items array is required and must not be empty" });
  }

  const orders_idorders = parseOrderId(rawId);
  if (!orders_idorders) {
    await log({ status: "validation_failed", event_type, store_code, project_code, error_message: "orders_idorders must be a number", caller_ip: ip });
    return res.status(400).json({ success: false, message: "orders_idorders must be a number" });
  }

  const existing = await Order.findOne({ orders_idorders }).lean();
  if (existing) {
    await log({ status: "skipped", event_type, orders_idorders, store_code, project_code, items_count: items.length, caller_ip: ip });
    return res.json({
      success: true,
      message: "Order already exists — skipped",
      already_exists: true,
      orders_idorders,
    });
  }

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

    notifyManagersOfNewOrder({
      orders_idorders,
      store_code: String(store_code).toUpperCase(),
      total_items: items.length,
      total_amount: Math.round(totalAmount * 100) / 100,
    }).catch((e) => console.error("[webhook] notifyManagersOfNewOrder failed:", e.message));

    await ProjectStore.updateOne(
      { project_code: String(project_code).toUpperCase(), store_code: String(store_code).toUpperCase() },
      { $setOnInsert: { project_code: String(project_code).toUpperCase(), store_code: String(store_code).toUpperCase() } },
      { upsert: true }
    );

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
      event_type,
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
      event_type,
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

/**
 * POST /api/webhook/order/cancel
 * Upstream admin cancelled the order — force-cancel in picker app even if picked or rider assigned.
 */
exports.cancelOrder = async (req, res) => {
  const ip = callerIp(req);
  const event_type = "order_cancel";
  if (!(await verifyWebhookAuth(req, res, ip, event_type))) return;

  const { orders_idorders: rawId, reason } = req.body;
  const orders_idorders = parseOrderId(rawId);

  if (!orders_idorders) {
    await log({ status: "validation_failed", event_type, error_message: "orders_idorders is required", caller_ip: ip });
    return res.status(400).json({ success: false, message: "orders_idorders is required" });
  }

  try {
    const result = await cancelOrderFromUpstream({ orders_idorders, reason });

    if (result.error) {
      await log({
        status: "error",
        event_type,
        orders_idorders,
        error_message: result.error,
        caller_ip: ip,
        metadata: { reason: reason || null },
      });
      return res.status(result.status || 400).json({ success: false, message: result.error });
    }

    await log({
      status: result.already_cancelled ? "skipped" : "success",
      event_type,
      orders_idorders,
      store_code: result.order?.store_code || null,
      project_code: result.order?.project_code || null,
      caller_ip: ip,
      metadata: {
        reason: reason || null,
        already_cancelled: !!result.already_cancelled,
        picker_assignments_cancelled: result.picker_assignments_cancelled ?? 0,
        delivery_assignments_cancelled: result.delivery_assignments_cancelled ?? 0,
        routes_updated: result.routes_updated ?? 0,
      },
    });

    return res.json({
      success: true,
      orders_idorders,
      already_cancelled: !!result.already_cancelled,
      picker_assignments_cancelled: result.picker_assignments_cancelled ?? 0,
      delivery_assignments_cancelled: result.delivery_assignments_cancelled ?? 0,
      routes_updated: result.routes_updated ?? 0,
      order: result.order,
    });
  } catch (err) {
    await log({ status: "error", event_type, orders_idorders, error_message: err.message, caller_ip: ip });
    console.error("[webhook] cancel order failed:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * POST /api/webhook/order/assign-rider
 * Upstream admin accepted the order — round-robin assign to a rider for that order's store + project.
 *
 * Body: orders_idorders, store_code, project_code (required)
 * Optional: latitude, longitude, prepare_order, replace_active
 * Optional override: rider_id or rider_email (skips round-robin)
 */
exports.assignRider = async (req, res) => {
  const ip = callerIp(req);
  const event_type = "order_assign_rider";
  if (!(await verifyWebhookAuth(req, res, ip, event_type))) return;

  const {
    orders_idorders: rawId,
    store_code,
    project_code,
    rider_id,
    rider_email,
    latitude,
    longitude,
    prepare_order,
    replace_active,
  } = req.body;

  const orders_idorders = parseOrderId(rawId);
  if (!orders_idorders) {
    await log({ status: "validation_failed", event_type, error_message: "orders_idorders is required", caller_ip: ip });
    return res.status(400).json({ success: false, message: "orders_idorders is required" });
  }

  if (!store_code || !project_code) {
    await log({
      status: "validation_failed",
      event_type,
      orders_idorders,
      error_message: "store_code and project_code are required",
      caller_ip: ip,
    });
    return res.status(400).json({ success: false, message: "store_code and project_code are required" });
  }

  const storeCode = String(store_code).toUpperCase();
  const projectCode = String(project_code).toUpperCase();

  try {
    const existing = await Order.findOne({ orders_idorders }).lean();
    if (!existing) {
      await log({
        status: "error",
        event_type,
        orders_idorders,
        store_code: storeCode,
        project_code: projectCode,
        error_message: "Order not found",
        caller_ip: ip,
      });
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (existing.store_code !== storeCode || existing.project_code !== projectCode) {
      await log({
        status: "validation_failed",
        event_type,
        orders_idorders,
        store_code: storeCode,
        project_code: projectCode,
        error_message: "store_code/project_code do not match order record",
        caller_ip: ip,
        metadata: {
          order_store_code: existing.store_code,
          order_project_code: existing.project_code,
        },
      });
      return res.status(400).json({
        success: false,
        message: "store_code/project_code do not match order record",
      });
    }

    const shouldPrepare =
      prepare_order !== false && (!existing || existing.status !== "completed");

    const useRoundRobin = !rider_id && !rider_email;

    const result = await assignRiderToOrder({
      orders_idorders,
      store_code: storeCode,
      project_code: projectCode,
      rider_id,
      rider_email,
      use_round_robin: useRoundRobin,
      prepare_order: shouldPrepare,
      replace_active: replace_active !== false,
      latitude,
      longitude,
    });

    if (result.error) {
      await log({
        status: "error",
        event_type,
        orders_idorders,
        store_code: storeCode,
        project_code: projectCode,
        error_message: result.error,
        caller_ip: ip,
        metadata: { use_round_robin: useRoundRobin },
      });
      return res.status(result.status || 400).json({ success: false, message: result.error });
    }

    await log({
      status: "success",
      event_type,
      orders_idorders,
      store_code: storeCode,
      project_code: projectCode,
      assigned: true,
      caller_ip: ip,
      metadata: {
        use_round_robin: useRoundRobin,
        rider_id: result.rider?._id ? String(result.rider._id) : null,
        rider_name: result.rider?.name || null,
        rider_email: result.rider?.email || null,
        round_robin: result.round_robin || null,
      },
    });

    return res.status(201).json({
      success: true,
      orders_idorders,
      store_code: storeCode,
      project_code: projectCode,
      rider_assigned: true,
      round_robin: result.round_robin || null,
      data: {
        assignment: result.assignment,
        rider: result.rider,
        order: result.order,
      },
    });
  } catch (err) {
    await log({
      status: "error",
      event_type,
      orders_idorders,
      store_code: store_code ? String(store_code).toUpperCase() : null,
      project_code: project_code ? String(project_code).toUpperCase() : null,
      error_message: err.message,
      caller_ip: ip,
    });
    console.error("[webhook] assign-rider failed:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
