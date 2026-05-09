const { MongoClient, ObjectId } = require("mongodb");
const fs = require("fs");
const path = require("path");

const MONGO_URI =
  "mongodb://picker_app:Picker%402026%23Secure@187.127.164.170:27017/picker_db?authSource=picker_db";

const CSV_PATH = path.join(__dirname, "../PickerDB.projectordermasters.csv");

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
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

  // Drop existing collections for clean seed
  await db.collection("order_items").drop().catch(() => {});
  await db.collection("orders").drop().catch(() => {});
  await db.collection("picker_users").drop().catch(() => {});
  await db.collection("round_robin_state").drop().catch(() => {});
  await db.collection("picker_assignments").drop().catch(() => {});
  await db.collection("picker_item_status").drop().catch(() => {});
  await db.collection("picker_escalations").drop().catch(() => {});
  await db.collection("sync_logs").drop().catch(() => {});

  console.log("Cleared old collections");

  // ─── 1. Seed order_items ───────────────────────────────────────────────
  const rows = parseCSV(CSV_PATH);

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

  await db.collection("order_items").insertMany(orderItems);
  console.log(`Inserted ${orderItems.length} order_items`);

  // ─── 2. Seed orders (grouped by orders_idorders) ──────────────────────
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

  const orders = Object.values(ordersMap).map((o) => ({
    ...o,
    total_amount: Math.round(o.total_amount * 100) / 100,
  }));

  await db.collection("orders").insertMany(orders);
  console.log(`Inserted ${orders.length} orders`);

  // ─── 3. Seed picker_users ──────────────────────────────────────────────
  const stores = ["RCM", "DOF", "MUBD"];

  const pickerUsers = [];

  for (const store of stores) {
    // 1 store manager per store
    pickerUsers.push({
      _id: new ObjectId(),
      name: `Manager ${store}`,
      email: `manager.${store.toLowerCase()}@patelrmart.com`,
      phone: `9000000${stores.indexOf(store)}01`,
      role: "store_manager",
      store_codes: [store],
      project_code: "RET3163",
      fcm_token: null,
      is_active: true,
      created_at: new Date(),
    });

    // 2 pickers per store
    for (let i = 1; i <= 2; i++) {
      pickerUsers.push({
        _id: new ObjectId(),
        name: `Picker ${store} ${i}`,
        email: `picker${i}.${store.toLowerCase()}@patelrmart.com`,
        phone: `9000000${stores.indexOf(store)}${i + 1}0`,
        role: "picker",
        store_codes: [store],
        project_code: "RET3163",
        fcm_token: null,
        is_active: true,
        created_at: new Date(),
      });
    }
  }

  await db.collection("picker_users").insertMany(pickerUsers);
  console.log(`Inserted ${pickerUsers.length} picker_users (3 managers + 6 pickers)`);

  // ─── 4. Seed round_robin_state ─────────────────────────────────────────
  const roundRobinDocs = [];

  for (const store of stores) {
    const storePickers = pickerUsers.filter(
      (u) => u.role === "picker" && u.store_codes.includes(store)
    );
    roundRobinDocs.push({
      store_code: store,
      project_code: "RET3163",
      last_assigned_picker_index: -1,
      picker_queue: storePickers.map((p) => p._id),
      updated_at: new Date(),
    });
  }

  await db.collection("round_robin_state").insertMany(roundRobinDocs);
  console.log(`Inserted ${roundRobinDocs.length} round_robin_state docs`);

  // ─── 5. Create indexes ─────────────────────────────────────────────────
  await db.collection("order_items").createIndex({ orders_idorders: 1, store_code: 1 });
  await db.collection("order_items").createIndex({ store_code: 1, product_picked_status: 1 });
  await db.collection("orders").createIndex({ orders_idorders: 1 }, { unique: true });
  await db.collection("orders").createIndex({ store_code: 1, status: 1 });
  await db.collection("picker_users").createIndex({ email: 1 }, { unique: true });
  await db.collection("picker_users").createIndex({ role: 1, store_codes: 1 });
  await db.collection("picker_assignments").createIndex({ orders_idorders: 1 });
  await db.collection("picker_assignments").createIndex({ assigned_to: 1, status: 1 });
  await db.collection("picker_item_status").createIndex({ assignment_id: 1 });
  await db.collection("picker_escalations").createIndex({ assignment_id: 1, status: 1 });

  console.log("Indexes created");

  await client.close();
  console.log("\nSeed complete.");
  console.log(`  order_items   : ${orderItems.length} docs`);
  console.log(`  orders        : ${orders.length} docs`);
  console.log(`  picker_users  : ${pickerUsers.length} docs`);
  console.log(`  round_robin   : ${roundRobinDocs.length} docs`);
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
