const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

const MONGO_URI =
  "mongodb://picker_app:Picker%402026%23Secure@187.127.164.170:27017/picker_db?authSource=picker_db";

const CSV_PATH = path.join(__dirname, "../PickerDB.projectordermasters copy.csv");

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n").filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes;
      } else if (line[i] === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += line[i];
      }
    }
    values.push(current.trim());

    const row = {};
    headers.forEach((h, i) => (row[h] = values[i] ?? ""));
    return row;
  });
}

async function seed() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log("Connected to picker_db on VPS");

  const db = client.db("picker_db");
  const rows = parseCSV(CSV_PATH);

  // Build order_items — include pcode_img
  const orderItems = rows.map((r) => ({
    _id: r._id,
    orders_idorders: Number(r.orders_idorders),
    store_code: r.store_code,
    project_code: r.project_code,
    department_name: r.department_name,
    category_name: r.category_name,
    sub_category_name: r.sub_category_name,
    p_code: r.p_code,
    barcode: r.barcode,
    item_name: r.item_name,
    pcode_img: r.pcode_img || null,
    product_description: r.product_description,
    pack_size: r.pack_size,
    ordered_quantity: Number(r.ordered_quantity),
    product_offer_price: Number(r.product_offer_price),
    product_mrp: Number(r.product_mrp),
    total_amt_our_price: Number(r.total_amt_our_price),
    total_amt_mrp: Number(r.total_amt_mrp),
    sell_rate_with_discount: Number(r.sell_rate_with_discount),
    order_date: new Date(r.order_date),
    delivery_date: r.delivery_date,
    product_picked_status: r.product_picked_status,
    synced_at: new Date(),
  }));

  // Upsert each item — preserves existing data, adds new ones
  let inserted = 0;
  let updated = 0;
  for (const item of orderItems) {
    const result = await db.collection("order_items").replaceOne(
      { _id: item._id },
      item,
      { upsert: true }
    );
    if (result.upsertedCount) inserted++;
    else updated++;
  }
  console.log(`order_items: ${inserted} inserted, ${updated} updated`);

  // Build and upsert orders (grouped header)
  const ordersMap = {};
  for (const item of orderItems) {
    const id = item.orders_idorders;
    if (!ordersMap[id]) {
      ordersMap[id] = {
        orders_idorders: id,
        store_code: item.store_code,
        project_code: item.project_code,
        order_date: item.order_date,
        delivery_date: item.delivery_date,
        total_items: 0,
        total_amount: 0,
        status: "pending",
        synced_at: new Date(),
      };
    }
    ordersMap[id].total_items += 1;
    ordersMap[id].total_amount += item.total_amt_our_price;
  }

  let ordersInserted = 0;
  let ordersUpdated = 0;
  for (const order of Object.values(ordersMap)) {
    order.total_amount = Math.round(order.total_amount * 100) / 100;
    const result = await db.collection("orders").updateOne(
      { orders_idorders: order.orders_idorders },
      { $setOnInsert: order },
      { upsert: true }
    );
    if (result.upsertedCount) ordersInserted++;
    else ordersUpdated++;
  }
  console.log(`orders: ${ordersInserted} inserted, ${ordersUpdated} already existed`);

  // Add new stores to round_robin_state if not present
  const newStores = [...new Set(orderItems.map((i) => i.store_code))];
  for (const store of newStores) {
    const exists = await db.collection("round_robin_state").findOne({ store_code: store });
    if (!exists) {
      // Find pickers for this store
      const pickers = await db.collection("picker_users").find({
        role: "picker",
        store_codes: store,
        is_active: true,
      }).toArray();

      await db.collection("round_robin_state").insertOne({
        store_code: store,
        project_code: "RET3163",
        last_assigned_picker_index: -1,
        picker_queue: pickers.map((p) => p._id),
        updated_at: new Date(),
      });
      console.log(`round_robin_state created for new store: ${store}`);
    }
  }

  // Summary
  const storeCount = {};
  for (const item of orderItems) storeCount[item.store_code] = (storeCount[item.store_code] || 0) + 1;
  console.log("\nItems by store:");
  for (const [store, count] of Object.entries(storeCount)) {
    console.log(`  ${store}: ${count} items`);
  }

  const orderSummary = {};
  for (const o of Object.values(ordersMap)) {
    orderSummary[o.store_code] = (orderSummary[o.store_code] || 0) + 1;
  }
  console.log("\nOrders by store:");
  for (const [store, count] of Object.entries(orderSummary)) {
    console.log(`  ${store}: ${count} orders`);
  }

  await client.close();
  console.log(`\nDone. ${orderItems.length} items across ${Object.keys(ordersMap).length} orders.`);
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
