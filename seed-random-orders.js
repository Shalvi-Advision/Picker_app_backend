const { MongoClient, ObjectId } = require("mongodb");
const fs = require("fs");
const path = require("path");

const MONGO_URI =
  "mongodb://picker_app:Picker%402026%23Secure@187.127.164.170:27017/picker_db?authSource=picker_db";

const CSV_PATH = path.join(__dirname, "../PickerDB.projectordermasters copy.csv");

// Distribute new orders across these stores. Each entry = how many orders to create.
const ORDERS_PER_STORE = {
  RCM: 6,
  DOF: 5,
  MUBD: 5,
  SHD: 6,
  BLEK: 5,
  NKR: 3,
  AME: 4,
  BHAR: 3,
  NSR: 3,
};

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

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr, n) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = rand(0, copy.length - 1);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function randomDate(daysFromToday) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(rand(8, 22), rand(0, 59), 0, 0);
  return d;
}

function newObjectIdHex() {
  return new ObjectId().toString();
}

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log("Connected to picker_db");

  const db = client.db("picker_db");
  const rows = parseCSV(CSV_PATH);

  // Build a catalog: unique products (deduped by p_code) — keeps pcode_img URLs
  const productMap = {};
  for (const r of rows) {
    if (r.p_code && !productMap[r.p_code]) {
      productMap[r.p_code] = {
        p_code: r.p_code,
        barcode: r.barcode,
        item_name: r.item_name,
        pcode_img: r.pcode_img || null,
        product_description: r.product_description,
        pack_size: r.pack_size,
        product_offer_price: Number(r.product_offer_price) || 0,
        product_mrp: Number(r.product_mrp) || 0,
        sell_rate_with_discount: Number(r.sell_rate_with_discount) || 0,
        department_name: r.department_name,
        category_name: r.category_name,
        sub_category_name: r.sub_category_name,
      };
    }
  }
  const catalog = Object.values(productMap);
  console.log(`Catalog: ${catalog.length} unique products`);

  // Find next order id
  const maxOrder = await db.collection("orders").find({}).sort({ orders_idorders: -1 }).limit(1).toArray();
  let nextOrderId = (maxOrder[0]?.orders_idorders ?? 90655) + 1;

  const orderItemsToInsert = [];
  const ordersToInsert = [];

  for (const [store, count] of Object.entries(ORDERS_PER_STORE)) {
    for (let i = 0; i < count; i++) {
      const orderId = nextOrderId++;
      const orderDate = randomDate(rand(-5, 0)); // up to 5 days ago
      const deliveryDate = randomDate(rand(0, 5));
      const itemCount = rand(2, 8);
      const selectedProducts = pickRandom(catalog, itemCount);

      let totalAmount = 0;
      let totalMrp = 0;

      for (const p of selectedProducts) {
        const qty = rand(1, 3);
        const lineTotal = p.product_offer_price * qty;
        const lineTotalMrp = p.product_mrp * qty;
        totalAmount += lineTotal;
        totalMrp += lineTotalMrp;

        orderItemsToInsert.push({
          _id: newObjectIdHex(),
          orders_idorders: orderId,
          store_code: store,
          project_code: "RET3163",
          department_name: p.department_name,
          category_name: p.category_name,
          sub_category_name: p.sub_category_name,
          p_code: p.p_code,
          barcode: p.barcode,
          item_name: p.item_name,
          pcode_img: p.pcode_img,
          product_description: p.product_description,
          pack_size: p.pack_size,
          ordered_quantity: qty,
          product_offer_price: p.product_offer_price,
          product_mrp: p.product_mrp,
          total_amt_our_price: lineTotal,
          total_amt_mrp: lineTotalMrp,
          sell_rate_with_discount: p.sell_rate_with_discount,
          order_date: orderDate,
          delivery_date: deliveryDate.toISOString().split("T")[0],
          product_picked_status: "Pending",
          synced_at: new Date(),
        });
      }

      ordersToInsert.push({
        orders_idorders: orderId,
        store_code: store,
        project_code: "RET3163",
        order_date: orderDate,
        delivery_date: deliveryDate.toISOString().split("T")[0],
        total_items: selectedProducts.length,
        total_amount: Math.round(totalAmount * 100) / 100,
        status: "pending",
        synced_at: new Date(),
      });
    }
  }

  // Insert
  if (orderItemsToInsert.length) {
    await db.collection("order_items").insertMany(orderItemsToInsert);
  }
  if (ordersToInsert.length) {
    await db.collection("orders").insertMany(ordersToInsert);
  }

  console.log(`\nInserted: ${ordersToInsert.length} orders | ${orderItemsToInsert.length} items`);
  console.log("\nBreakdown:");
  for (const [store, count] of Object.entries(ORDERS_PER_STORE)) {
    const storeItems = orderItemsToInsert.filter((i) => i.store_code === store).length;
    console.log(`  ${store}: ${count} orders, ${storeItems} items`);
  }

  await client.close();
  console.log("\nDone.");
}

run().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
