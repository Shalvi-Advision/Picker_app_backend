const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

const MONGO_URI =
  "mongodb://picker_app:Picker%402026%23Secure@187.127.164.170:27017/picker_db?authSource=picker_db";

const CSV_PATH = path.join(__dirname, "../PickerDB.projectordermasters copy.csv");

// Orders that belong to new stores — need to be fixed
const NEW_STORE_ORDERS = [90646, 90647, 90651, 90653, 90654, 90655];

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

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log("Connected to picker_db");

  const db = client.db("picker_db");
  const rows = parseCSV(CSV_PATH);

  // Only work with rows for the 6 new-store orders
  const csvRows = rows.filter((r) => NEW_STORE_ORDERS.includes(Number(r.orders_idorders)));
  console.log(`CSV rows for new-store orders: ${csvRows.length}`);

  // 1. Delete stale order_items for these order IDs
  const delItems = await db.collection("order_items").deleteMany({
    orders_idorders: { $in: NEW_STORE_ORDERS },
  });
  console.log(`Deleted ${delItems.deletedCount} stale order_items`);

  // 2. Delete stale orders documents for these order IDs
  const delOrders = await db.collection("orders").deleteMany({
    orders_idorders: { $in: NEW_STORE_ORDERS },
  });
  console.log(`Deleted ${delOrders.deletedCount} stale orders`);

  // 3. Re-insert order_items from CSV
  const orderItems = csvRows.map((r) => ({
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

  await db.collection("order_items").insertMany(orderItems);
  console.log(`Inserted ${orderItems.length} order_items`);

  // 4. Re-build and insert orders grouped by orders_idorders
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

  // 5. Summary
  console.log("\nOrders seeded:");
  for (const o of orders) {
    console.log(`  #${o.orders_idorders} | ${o.store_code} | ${o.total_items} items | ₹${o.total_amount} | delivery: ${o.delivery_date}`);
  }

  await client.close();
  console.log("\nDone.");
}

run().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
