const mongoose = require("mongoose");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const PickerAssignment = require("../models/PickerAssignment");
const PickerItemStatus = require("../models/PickerItemStatus");
const PickerEscalation = require("../models/PickerEscalation");
const RoundRobinState = require("../models/RoundRobinState");
const SyncLog = require("../models/SyncLog");

const SOURCE_URL =
  process.env.SOURCE_ORDERS_API_URL ||
  "https://picker.shalviadvision.com/api/get_project_pending_orders";
const PROJECT_CODE = process.env.SYNC_PROJECT_CODE || "RET3163";

// The upstream API serialises everything as strings, and uses the literal
// "null" string for empty geo fields. Normalise both here.
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
 * Fetch the raw pending-order rows from the upstream project API.
 * Returns a flat array of order-item rows (one row per product line).
 */
const fetchPendingOrders = async (project_code = PROJECT_CODE) => {
  const res = await fetch(SOURCE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_code }),
  });

  if (!res.ok) {
    throw new Error(`Source API responded ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Source API did not return an array of order rows");
  }
  return data;
};

/** Map a single upstream row to our order_items document shape. */
const mapItem = (row) => ({
  _id: new mongoose.Types.ObjectId().toString(),
  orders_idorders: toNumber(row.orders_idorders),
  store_code: row.store_code,
  project_code: row.project_code,
  department_name: row.department_name,
  category_name: row.category_name,
  sub_category_name: row.sub_category_name,
  p_code: row.p_code,
  barcode: row.barcode,
  item_name: row.item_name,
  product_description: row.product_description,
  pack_size: row.pack_size,
  ordered_quantity: toNumber(row.ordered_quantity),
  product_offer_price: toNumber(row.product_offer_price),
  product_mrp: toNumber(row.product_mrp),
  total_amt_our_price: toNumber(row.total_amt_our_price),
  total_amt_mrp: toNumber(row.total_amt_mrp),
  sell_rate_with_discount: toNumber(row.sell_rate_with_discount),
  order_date: parseDate(row.order_date),
  delivery_date: row.delivery_date,
  pcode_img: toNullableString(row.pcode_img),
  product_picked_status: row.product_picked_status || "Pending",
  delivery_details: toNullableString(row.delivery_details),
  latitude: toNullableString(row.latitude),
  longitude: toNullableString(row.longitude),
  synced_at: new Date(),
});

/** Group flat item rows into one order document per orders_idorders. */
const buildOrders = (items) => {
  const byOrder = {};
  for (const item of items) {
    const id = item.orders_idorders;
    if (!byOrder[id]) {
      byOrder[id] = {
        orders_idorders: id,
        store_code: item.store_code,
        project_code: item.project_code,
        order_date: item.order_date,
        delivery_date: item.delivery_date,
        total_items: 0,
        total_amount: 0,
        status: "pending",
        delivery_details: item.delivery_details,
        latitude: item.latitude,
        longitude: item.longitude,
        synced_at: new Date(),
      };
    }
    byOrder[id].total_items += 1;
    byOrder[id].total_amount += item.total_amt_our_price;
  }
  return Object.values(byOrder).map((o) => ({
    ...o,
    total_amount: Math.round(o.total_amount * 100) / 100,
  }));
};

/**
 * DESTRUCTIVE full reset. Wipes all orders, order_items and downstream picker
 * data for the project, then inserts the freshly-fetched orders. Intended for
 * the manual super-admin endpoint, NOT the cron.
 */
const replaceOrders = async (project_code = PROJECT_CODE) => {
  const rows = await fetchPendingOrders(project_code);
  const items = rows.map(mapItem);
  const orders = buildOrders(items);

  const scope = { project_code };

  // picker_item_status and picker_escalations carry no project_code, so scope
  // their cleanup by the order IDs that currently belong to this project.
  const existingOrderIds = (
    await Order.find(scope).select("orders_idorders").lean()
  ).map((o) => o.orders_idorders);
  const orderIdScope = { orders_idorders: { $in: existingOrderIds } };

  // Clear downstream picker work first so nothing points at deleted orders.
  const [delAssignments, delItemStatus, delEscalations, delRR, delItems, delOrders] =
    await Promise.all([
      PickerAssignment.deleteMany(scope),
      PickerItemStatus.deleteMany(orderIdScope),
      PickerEscalation.deleteMany(orderIdScope),
      RoundRobinState.deleteMany(scope),
      OrderItem.deleteMany(scope),
      Order.deleteMany(scope),
    ]);

  if (items.length) await OrderItem.insertMany(items);
  if (orders.length) await Order.insertMany(orders);

  await SyncLog.create({
    project_code,
    last_synced_at: new Date(),
    last_sync_status: "success",
    orders_synced: orders.length,
  });

  return {
    project_code,
    orders_inserted: orders.length,
    items_inserted: items.length,
    cleared: {
      orders: delOrders.deletedCount,
      order_items: delItems.deletedCount,
      picker_assignments: delAssignments.deletedCount,
      picker_item_statuses: delItemStatus.deletedCount,
      picker_escalations: delEscalations.deletedCount,
      round_robin_state: delRR.deletedCount,
    },
  };
};

/**
 * NON-destructive incremental sync for the cron. Upserts orders and items by
 * their natural keys; never deletes assignments or in-progress picker work.
 * Orders an order's items shrink/grow with the upstream payload, but existing
 * picker assignments are left intact.
 */
const upsertOrders = async (project_code = PROJECT_CODE) => {
  const rows = await fetchPendingOrders(project_code);
  const items = rows.map(mapItem);
  const orders = buildOrders(items);

  // Group items by order so we can replace each order's item set atomically.
  // This is the only reliable way to mirror the upstream row-for-row: the same
  // product can legitimately appear on multiple lines of one order (e.g. p_code
  // 1625 under two categories), so there is no stable natural key to upsert on.
  const itemsByOrder = {};
  for (const item of items) {
    (itemsByOrder[item.orders_idorders] ||= []).push(item);
  }

  // Don't touch orders a picker has already started — replacing their items
  // would wipe in-flight picking. Only pending (or brand-new) orders are synced.
  const incomingIds = orders.map((o) => o.orders_idorders);
  const lockedOrders = await Order.find({
    orders_idorders: { $in: incomingIds },
    status: { $ne: "pending" },
  })
    .select("orders_idorders")
    .lean();
  const locked = new Set(lockedOrders.map((o) => o.orders_idorders));

  let ordersNew = 0;
  let ordersUpdated = 0;
  let itemsWritten = 0;
  let ordersSkipped = 0;

  for (const order of orders) {
    if (locked.has(order.orders_idorders)) {
      ordersSkipped += 1;
      continue;
    }

    const { status, synced_at, ...fields } = order;
    const res = await Order.updateOne(
      { orders_idorders: order.orders_idorders },
      { $set: { ...fields, synced_at }, $setOnInsert: { status } },
      { upsert: true }
    );
    if (res.upsertedCount) ordersNew += 1;
    else if (res.modifiedCount) ordersUpdated += 1;

    // Replace this order's items wholesale so every upstream row is its own doc.
    const orderItems = itemsByOrder[order.orders_idorders] || [];
    await OrderItem.deleteMany({ orders_idorders: order.orders_idorders });
    if (orderItems.length) await OrderItem.insertMany(orderItems);
    itemsWritten += orderItems.length;
  }

  await SyncLog.create({
    project_code,
    last_synced_at: new Date(),
    last_sync_status: "success",
    orders_synced: orders.length,
  });

  return {
    project_code,
    orders_seen: orders.length,
    items_seen: items.length,
    orders_new: ordersNew,
    orders_updated: ordersUpdated,
    orders_skipped_in_progress: ordersSkipped,
    items_written: itemsWritten,
  };
};

module.exports = {
  fetchPendingOrders,
  replaceOrders,
  upsertOrders,
  PROJECT_CODE,
};
