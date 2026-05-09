const { MongoClient, ObjectId } = require("mongodb");

const MONGO_URI =
  "mongodb://picker_app:Picker%402026%23Secure@187.127.164.170:27017/picker_db?authSource=picker_db";

const STORES = ["RCM", "DOF", "MUBD"];
const PROJECT_CODE = "RET3163";

const DEPARTMENTS = [
  { dept: "BEVERAGES", cat: "COLD DRINKS", sub: "PET BOTTLES" },
  { dept: "BEVERAGES", cat: "TEA & COFFEE", sub: "TEA" },
  { dept: "BEVERAGES", cat: "JUICES & DRINKS", sub: "COCONUT WATER" },
  { dept: "GROCERY & STAPLES", cat: "EDIBLE OILS", sub: "SUNFLOWER OILS" },
  { dept: "GROCERY & STAPLES", cat: "MASALA / SPICES", sub: "WHOLE / AKKHA MASALA" },
  { dept: "GROCERY & STAPLES", cat: "FRUITS & VEGETABLES", sub: "FRUITS & VEGETABLES" },
  { dept: "GROCERY & STAPLES", cat: "GHEE & VANASPATI", sub: "GHEE" },
  { dept: "HOUSEHOLD ITEMS", cat: "ALL PURPOSE CLEANERS", sub: "FLOOR CLEANERS" },
  { dept: "HOUSEHOLD ITEMS", cat: "DISHWASHERS", sub: "DISHWASHING BARS" },
  { dept: "BISCUITS, SNACKS & CHOCOLATES", cat: "BREAKFAST CEREALS", sub: "FLAKES" },
  { dept: "BISCUITS, SNACKS & CHOCOLATES", cat: "CHOCOLATES, CANDIES & JELLYS", sub: "CHOCOLATE BARS" },
  { dept: "NOODLES, SAUCES & INSTANT FOOD", cat: "PASTA & SOUPS", sub: "PASTA & MACARONI" },
];

const PRODUCTS = [
  { name: "Sprite 2.25lt Btl", barcode: "8901764032905", mrp: 100, price: 80, pack: "2 LT", p_code: "7441" },
  { name: "Thums Up 2.25 Lt", barcode: "8901764042904", mrp: 100, price: 80, pack: "2 LT", p_code: "1602" },
  { name: "Wagh Bakri Tea 500gm", barcode: "8901747001546", mrp: 310, price: 300, pack: "500 GM", p_code: "2682" },
  { name: "Lizol Citrus 500ml", barcode: "8901396112211", mrp: 129, price: 127, pack: "500 ML", p_code: "5687" },
  { name: "Kelloggs Chocos 240gm", barcode: "8901499008237", mrp: 185, price: 175, pack: "240 GM", p_code: "34228" },
  { name: "Dettol Hand Wash 900ml", barcode: "8901396387794", mrp: 155, price: 153, pack: "900 ML", p_code: "30414" },
  { name: "Exo Dish Bar 500gm", barcode: "8902102163633", mrp: 52, price: 47, pack: "500 GM", p_code: "7366" },
  { name: "Colin 500ml", barcode: "8901396476146", mrp: 120, price: 118, pack: "500 ML", p_code: "206" },
  { name: "Real Coconut Water 1lt", barcode: "8901207053634", mrp: 178, price: 89, pack: "1 LT", p_code: "38730" },
  { name: "Gowardhan Ghee 2lt", barcode: "8906001024842", mrp: 1640, price: 1500, pack: "2 KG", p_code: "27329" },
  { name: "Onion 1bag", barcode: "8464", mrp: 110, price: 49, pack: "1 NO", p_code: "8464" },
  { name: "Coconut Whole", barcode: "3162", mrp: 46, price: 36, pack: "1 NO", p_code: "3162" },
  { name: "Haldiram Rasmalai 400gm", barcode: "8904004440980", mrp: 250, price: 200, pack: "400 GM", p_code: "39373" },
  { name: "Priya Sun Oil 750gm", barcode: "8906191580050", mrp: 175, price: 144, pack: "1 KG", p_code: "34155" },
  { name: "Cadbury 5 Star 9.8gm", barcode: "7622202818431", mrp: 5, price: 4.95, pack: "10 GM", p_code: "1118" },
  { name: "Ind Chaska Jeera 500gm", barcode: "17751", mrp: 220, price: 199, pack: "500 GM", p_code: "17751" },
  { name: "Ind Chaska Penne Pasta 200gm", barcode: "32823", mrp: 39, price: 29, pack: "200 GM", p_code: "32823" },
  { name: "Imli 100gm", barcode: "25942", mrp: 43, price: 35, pack: "100 GM", p_code: "25942" },
  { name: "Aer Spray 220ml", barcode: "8901157045109", mrp: 99, price: 97, pack: "220 ML", p_code: "22132" },
  { name: "Kasuri Methi 50gm", barcode: "249", mrp: 44, price: 39, pack: "50 GM", p_code: "249" },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(randomInt(8, 20), randomInt(0, 59), 0, 0);
  return d;
}

function deliveryDate(orderDate) {
  const d = new Date(orderDate);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

async function seedOrders() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log("Connected to picker_db on VPS");

  const db = client.db("picker_db");

  // Find the highest existing orders_idorders
  const lastOrder = await db.collection("orders").findOne({}, { sort: { orders_idorders: -1 } });
  let nextOrderId = lastOrder ? lastOrder.orders_idorders + 1 : 90700;

  const allOrderItems = [];
  const allOrders = [];

  for (let o = 0; o < 30; o++) {
    const store = randomFrom(STORES);
    const orderId = nextOrderId++;
    const orderDate = randomDate(randomInt(0, 7));
    const delivery = deliveryDate(orderDate);
    const itemCount = randomInt(2, 8);

    let totalAmount = 0;
    const items = [];

    for (let i = 0; i < itemCount; i++) {
      const product = randomFrom(PRODUCTS);
      const dept = randomFrom(DEPARTMENTS);
      const qty = randomInt(1, 5);
      const lineTotal = Math.round(product.price * qty * 100) / 100;
      totalAmount += lineTotal;

      items.push({
        _id: new ObjectId().toString(),
        orders_idorders: orderId,
        store_code: store,
        project_code: PROJECT_CODE,
        department_name: dept.dept,
        category_name: dept.cat,
        sub_category_name: dept.sub,
        p_code: product.p_code,
        barcode: product.barcode,
        item_name: product.name,
        product_description: product.name.toUpperCase(),
        pack_size: product.pack,
        ordered_quantity: qty,
        product_offer_price: product.price,
        product_mrp: product.mrp,
        total_amt_our_price: lineTotal,
        total_amt_mrp: Math.round(product.mrp * qty * 100) / 100,
        sell_rate_with_discount: product.price,
        order_date: orderDate,
        delivery_date: delivery,
        product_picked_status: "Pending",
        synced_at: new Date(),
      });
    }

    allOrderItems.push(...items);
    allOrders.push({
      orders_idorders: orderId,
      store_code: store,
      project_code: PROJECT_CODE,
      order_date: orderDate,
      delivery_date: delivery,
      total_items: itemCount,
      total_amount: Math.round(totalAmount * 100) / 100,
      status: "pending",
      synced_at: new Date(),
    });
  }

  await db.collection("order_items").insertMany(allOrderItems);
  console.log(`Inserted ${allOrderItems.length} order_items`);

  await db.collection("orders").insertMany(allOrders);
  console.log(`Inserted ${allOrders.length} orders`);

  // Summary by store
  const storeSummary = {};
  for (const o of allOrders) {
    storeSummary[o.store_code] = (storeSummary[o.store_code] || 0) + 1;
  }
  console.log("\nOrders by store:");
  for (const [store, count] of Object.entries(storeSummary)) {
    console.log(`  ${store}: ${count} orders`);
  }
  console.log(`\nOrder IDs: ${allOrders[0].orders_idorders} → ${allOrders[allOrders.length - 1].orders_idorders}`);

  await client.close();
  console.log("\nDone.");
}

seedOrders().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
