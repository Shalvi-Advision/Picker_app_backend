const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const PickerUser = require("../models/PickerUser");
const { assignRiderToOrder } = require("../services/deliveryAssignmentService");
const { notifyManagersOfNewOrder } = require("../services/notificationService");
const { admin } = require("../config/firebase");

// Real catalog products (from PickerDB CSV) — used for test order generation.
// Each entry includes a pcode_img so UI image rendering can be tested end-to-end.
const SAMPLE_PRODUCTS = [
  { p_code: "22206", barcode: "8906006783331", item_name: "Surabhi Nog Tomato Ketup 900g", pcode_img: "https://retailmagic.in/cdn/RET3163/22206_1.webp", pack_size: "900 GM", product_offer_price: 63, product_mrp: 126 },
  { p_code: "9179", barcode: "8901595862962", item_name: "Chings Schez Chutney 250gm-btl", pcode_img: "https://retailmagic.in/cdn/RET3163/9179_1.webp", pack_size: "250 GM", product_offer_price: 65, product_mrp: 85 },
  { p_code: "4143", barcode: "8901058023763", item_name: "Maggi Masala Noodle 560gm", pcode_img: "https://retailmagic.in/cdn/RET3163/4143_1.webp", pack_size: "560 GM", product_offer_price: 106, product_mrp: 116 },
  { p_code: "4968", barcode: "4968", item_name: "Chana Dal (loose)", pcode_img: "https://retailmagic.in/cdn/RET3163/4968_1.webp", pack_size: "1 KG", product_offer_price: 86, product_mrp: 86 },
  { p_code: "2296", barcode: "M3", item_name: "Ind Chaska Akha Moong 250 Gm", pcode_img: "https://retailmagic.in/cdn/RET3163/2296_1.webp", pack_size: "250 GM", product_offer_price: 41, product_mrp: 43 },
  { p_code: "20907", barcode: "20907", item_name: "Ind Chaska Khichdi Mix 500gm", pcode_img: "https://retailmagic.in/cdn/RET3163/20907_1.webp", pack_size: "500 GM", product_offer_price: 65, product_mrp: 68 },
  { p_code: "2365", barcode: "MGD3", item_name: "Ind Chaska Moong Dal 250 Gm", pcode_img: "https://retailmagic.in/cdn/RET3163/2365_1.webp", pack_size: "250 GM", product_offer_price: 39, product_mrp: 41 },
  { p_code: "13678", barcode: "13678", item_name: "Ind Chaska Toor Dal 1 Kg", pcode_img: "https://retailmagic.in/cdn/RET3163/13678_1.webp", pack_size: "1 KG", product_offer_price: 155, product_mrp: 160 },
  { p_code: "1974", barcode: "8901786061013", item_name: "Eve. Chat Mas. 100 Gm Cbd", pcode_img: "https://retailmagic.in/cdn/RET3163/1974_1.webp", pack_size: "100 GM", product_offer_price: 82.65, product_mrp: 87 },
  { p_code: "25226", barcode: "25226", item_name: "Eve. Kashmirilal  Powde 50 Gm", pcode_img: "https://retailmagic.in/cdn/RET3163/25226_1.webp", pack_size: "50 GM", product_offer_price: 61.38, product_mrp: 62 },
  { p_code: "1962", barcode: "1962", item_name: "Eve. Kasuri Methi  25gm Cbd", pcode_img: "https://retailmagic.in/cdn/RET3163/1962_1.webp", pack_size: "25 GM", product_offer_price: 29.7, product_mrp: 30 },
  { p_code: "1967", barcode: "8901786121014", item_name: "Eve. Kitchen King 100 Gm Cbd", pcode_img: "https://retailmagic.in/cdn/RET3163/1967_1.webp", pack_size: "100 GM", product_offer_price: 91.2, product_mrp: 96 },
  { p_code: "10709", barcode: "10709", item_name: "Eve. Turmeric Powder 100 Gm", pcode_img: "https://retailmagic.in/cdn/RET3163/10709_1.webp", pack_size: "100 GM", product_offer_price: 47.52, product_mrp: 48 },
  { p_code: "30419", barcode: "8901786762002", item_name: "Everest Ginger Garlic Paste 200 Gm", pcode_img: "https://retailmagic.in/cdn/RET3163/30419_1.webp", pack_size: "200 GM", product_offer_price: 44.65, product_mrp: 47 },
  { p_code: "5135", barcode: "5135", item_name: "Ind Chaska Akha Dhaniya 500 Gm", pcode_img: "https://retailmagic.in/cdn/RET3163/5135_1.webp", pack_size: "500 GM", product_offer_price: 130, product_mrp: 140 },
  { p_code: "29919", barcode: "29919", item_name: "Ind Chaska Kokam Phool 100gm", pcode_img: "https://retailmagic.in/cdn/RET3163/29919_1.webp", pack_size: "100 GM", product_offer_price: 101, product_mrp: 109 },
  { p_code: "2094", barcode: "2094", item_name: "Ind Chaska Rai 100gm", pcode_img: "https://retailmagic.in/cdn/RET3163/2094_1.webp", pack_size: "100 GM", product_offer_price: 23, product_mrp: 31 },
  { p_code: "32034", barcode: "3203400000102", item_name: "Bajri Super (b)", pcode_img: "https://retailmagic.in/cdn/RET3163/32034_1.webp", pack_size: "1 KG", product_offer_price: 48, product_mrp: 48 },
  { p_code: "39331", barcode: "8901537074934", item_name: "Daawat Pulav Basmati Rice 500gm.", pcode_img: "https://retailmagic.in/cdn/RET3163/39331_1.webp", pack_size: "500 ML", product_offer_price: 65, product_mrp: 90 },
  { p_code: "1201", barcode: "JP1", item_name: "Ind Chaska Jada Poha 1 Kg", pcode_img: "https://retailmagic.in/cdn/RET3163/1201_1.webp", pack_size: "1 KG", product_offer_price: 72, product_mrp: 77 },
  { p_code: "3707", barcode: "3707", item_name: "Rice Surti Kolam (b)", pcode_img: "https://retailmagic.in/cdn/RET3163/3707_1.webp", pack_size: "1 KG", product_offer_price: 75, product_mrp: 75 },
  { p_code: "2746", barcode: "2746", item_name: "Ind Chaska Black Salt Pow 100gm", pcode_img: "https://retailmagic.in/cdn/RET3163/2746_1.webp", pack_size: "100 GM", product_offer_price: 12, product_mrp: 20 },
  { p_code: "23720", barcode: "8908020265060", item_name: "Paawak Jaggery  Pow 500gm", pcode_img: "https://retailmagic.in/cdn/RET3163/23720_1.webp", pack_size: "500 GM", product_offer_price: 115, product_mrp: 130 },
  { p_code: "2424", barcode: "8904043901015", item_name: "Tata Salt 1kg", pcode_img: "https://retailmagic.in/cdn/RET3163/2424_1.webp", pack_size: "1 KG", product_offer_price: 29.7, product_mrp: 30 },
  { p_code: "5531", barcode: "8901396313151", item_name: "Det L/sp Orig Pouch 175ml", pcode_img: "https://retailmagic.in/cdn/RET3163/5531_1.webp", pack_size: "175 ML", product_offer_price: 49.5, product_mrp: 50 },
  { p_code: "6155", barcode: "8901030878244", item_name: "Pears Soap Soft &fre 4x125g", pcode_img: "https://retailmagic.in/cdn/RET3163/6155_1.webp", pack_size: "500 GM", product_offer_price: 255, product_mrp: 350 },
  { p_code: "4442", barcode: "89006245", item_name: "Iodex 8gm Btl", pcode_img: "https://retailmagic.in/cdn/RET3163/4442_1.webp", pack_size: "8 GM", product_offer_price: 49.5, product_mrp: 50 },
  { p_code: "9512", barcode: "8906006640023", item_name: "Relispray Pain Relife Spray49gm", pcode_img: "https://retailmagic.in/cdn/RET3163/9512_1.webp", pack_size: "49 GM", product_offer_price: 228, product_mrp: 243 },
  { p_code: "39664", barcode: "8904422708969", item_name: "Pata Dantkan Naturl T/p 800g", pcode_img: "https://retailmagic.in/cdn/RET3163/39664_1.webp", pack_size: "800 GM", product_offer_price: 309, product_mrp: 364 },
  { p_code: "297", barcode: "8906007280716", item_name: "Fortune Rice Bran Oil 4.35(j)", pcode_img: "https://retailmagic.in/cdn/RET3163/297_1.webp", pack_size: "4 KG", product_offer_price: 850, product_mrp: 1025 },
  { p_code: "7270", barcode: "8909106022034", item_name: "Comfort Fab Con Blue 860ml", pcode_img: "https://retailmagic.in/cdn/RET3163/7270_1.webp", pack_size: "860 ML", product_offer_price: 205, product_mrp: 235 },
  { p_code: "22187", barcode: "8901331001037", item_name: "Ghadi Detergent Bar 145gm", pcode_img: "https://retailmagic.in/cdn/RET3163/22187_1.webp", pack_size: "145 GM", product_offer_price: 9.9, product_mrp: 10 },
  { p_code: "11172", barcode: "8909106010055", item_name: "Surf Excel Blue 1.5kg", pcode_img: "https://retailmagic.in/cdn/RET3163/11172_1.webp", pack_size: "2 KG", product_offer_price: 218, product_mrp: 235 },
  { p_code: "8236", barcode: "8901396040606", item_name: "Vanish Liq 180ml", pcode_img: "https://retailmagic.in/cdn/RET3163/8236_1.webp", pack_size: "180 ML", product_offer_price: 79.2, product_mrp: 80 },
  { p_code: "4737", barcode: "4737", item_name: "Colin  250 Ml (b)", pcode_img: "https://retailmagic.in/cdn/RET3163/4737_1.webp", pack_size: "250 ML", product_offer_price: 78.21, product_mrp: 79 },
  { p_code: "5583", barcode: "8901396117537", item_name: "Lizol 3 -1 Lavender 500ml", pcode_img: "https://retailmagic.in/cdn/RET3163/5583_1.webp", pack_size: "500 ML", product_offer_price: 127.71, product_mrp: 129 },
  { p_code: "7755", barcode: "8906035554407", item_name: "Patel Fre Clean Materi Combi", pcode_img: "https://retailmagic.in/cdn/RET3163/7755_1.webp", pack_size: "1 NO", product_offer_price: 168.3, product_mrp: 170 },
  { p_code: "7366", barcode: "8902102163633", item_name: "Exo Dish Bar Round 500gm", pcode_img: "https://retailmagic.in/cdn/RET3163/7366_1.webp", pack_size: "500 GM", product_offer_price: 47, product_mrp: 52 },
  { p_code: "1600", barcode: "B2", item_name: "Ind Chaska Besan 500 Gm", pcode_img: "https://retailmagic.in/cdn/RET3163/1600_1.webp", pack_size: "500 GM", product_offer_price: 55, product_mrp: 58 },
  { p_code: "12092", barcode: "7622202207754", item_name: "Bournvita Glucose Bis 111.6gm", pcode_img: "https://retailmagic.in/cdn/RET3163/12092_1.webp", pack_size: "112 GM", product_offer_price: 29.7, product_mrp: 30 },
  { p_code: "11400", barcode: "8901063029415", item_name: "Bri Treat Jimjam Bis 150gm", pcode_img: "https://retailmagic.in/cdn/RET3163/11400_1.webp", pack_size: "150 GM", product_offer_price: 38, product_mrp: 40 },
  { p_code: "32745", barcode: "8906029450081", item_name: "Foodrite Eggless Mayoni 100gm", pcode_img: "https://retailmagic.in/cdn/RET3163/32745_1.webp", pack_size: "100 GM", product_offer_price: 21, product_mrp: 42 },
  { p_code: "34834", barcode: "8901491103800", item_name: "Quaker Oatmeal Oats 1kg (r)", pcode_img: "https://retailmagic.in/cdn/RET3163/34834_1.webp", pack_size: "1 KG", product_offer_price: 190, product_mrp: 210 },
  { p_code: "11289", barcode: "8901207021367", item_name: "Real Cranberry Nectar 1 Lt Cb", pcode_img: "https://retailmagic.in/cdn/RET3163/11289_1.webp", pack_size: "1 LT", product_offer_price: 120, product_mrp: 140 },
  { p_code: "9472", barcode: "8902080304103", item_name: "7 Up 2.25lt Btl", pcode_img: "https://retailmagic.in/cdn/RET3163/9472_1.webp", pack_size: "2 LT", product_offer_price: 72, product_mrp: 100 },
  { p_code: "23737", barcode: "8904071702196", item_name: "Chheda Yellow Banana Chip500gm", pcode_img: "https://retailmagic.in/cdn/RET3163/23737_1.webp", pack_size: "500 GM", product_offer_price: 164, product_mrp: 328 },
  { p_code: "34101", barcode: "8904004400601", item_name: "Haldiram Lite Chiwda 200gm", pcode_img: "https://retailmagic.in/cdn/RET3163/34101_1.webp", pack_size: "150 GM", product_offer_price: 37, product_mrp: 42 },
  { p_code: "6197", barcode: "6197", item_name: "Society Tea 100gm (r)", pcode_img: "https://retailmagic.in/cdn/RET3163/6197_1.webp", pack_size: "100 GM", product_offer_price: 59.4, product_mrp: 60 },
  { p_code: "14690", barcode: "8901468001689", item_name: "Deep Shakti Oil 900ml", pcode_img: "https://retailmagic.in/cdn/RET3163/14690_1.webp", pack_size: "900 ML", product_offer_price: 190, product_mrp: 215 },
  { p_code: "8388", barcode: "8901396153153", item_name: "Harpic Bath Cln Floral 500ml", pcode_img: "https://retailmagic.in/cdn/RET3163/8388_1.webp", pack_size: "500 ML", product_offer_price: 118.8, product_mrp: 120 },
  { p_code: "9135", barcode: "8909106022058", item_name: "Comfort Fab Con Blue 430ml", pcode_img: "https://retailmagic.in/cdn/RET3163/9135_1.webp", pack_size: "430 ML", product_offer_price: 118.8, product_mrp: 120 },
  { p_code: "18451", barcode: "8909106050471", item_name: "Surf Exl Mat Liq (p) T/l 2l", pcode_img: "https://retailmagic.in/cdn/RET3163/18451_1.webp", pack_size: "2 LT", product_offer_price: 299, product_mrp: 329 },
  { p_code: "8843", barcode: "8901441011032", item_name: "Lijjat Udid Papad 500 Gm", pcode_img: "https://retailmagic.in/cdn/RET3163/8843_1.webp", pack_size: "500 GM", product_offer_price: 180, product_mrp: 190 },
  { p_code: "1588", barcode: "SB2", item_name: "Ind Chaska Sabudana 500 Gm (n.w)", pcode_img: "https://retailmagic.in/cdn/RET3163/1588_1.webp", pack_size: "500 GM", product_offer_price: 40, product_mrp: 43 },
  { p_code: "22656", barcode: "22656", item_name: "Ind Chaska Groundnut Bold 500gm", pcode_img: "https://retailmagic.in/cdn/RET3163/22656_1.webp", pack_size: "500 GM", product_offer_price: 102, product_mrp: 105 },
  { p_code: "6618", barcode: "6618", item_name: "Ind Chaska Toor Dal 500 Gm", pcode_img: "https://retailmagic.in/cdn/RET3163/6618_1.webp", pack_size: "500 GM", product_offer_price: 80, product_mrp: 83 },
  { p_code: "2050", barcode: "2050", item_name: "Wheat 147 (b)", pcode_img: "https://retailmagic.in/cdn/RET3163/2050_1.webp", pack_size: "1 KG", product_offer_price: 44, product_mrp: 44 },
  { p_code: "16146", barcode: "8901571005666", item_name: "Sensodyne Fresh Gel 150gm", pcode_img: "https://retailmagic.in/cdn/RET3163/16146_1.webp", pack_size: "150 GM", product_offer_price: 221.76, product_mrp: 224 },
  { p_code: "16121", barcode: "8901571005659", item_name: "Sensodyne Fresh Mint 150 Gm", pcode_img: "https://retailmagic.in/cdn/RET3163/16121_1.webp", pack_size: "150 GM", product_offer_price: 242.55, product_mrp: 245 },
  { p_code: "17790", barcode: "8901030853678", item_name: "Lifebuoy Neem & Aloe 100gm", pcode_img: "https://retailmagic.in/cdn/RET3163/17790_1.webp", pack_size: "100 GM", product_offer_price: 37.62, product_mrp: 38 },
];

/**
 * Create a dummy order with items for end-to-end testing.
 *
 * POST /api/test/order
 *   body (all optional):
 *     {
 *       "store_code": "SHD",
 *       "project_code": "RET3163",
 *       "item_count": 3,
 *       "orders_idorders": 99001     // override order number, otherwise auto
 *     }
 */
exports.createTestOrder = async (req, res) => {
  try {
    const storeCode = (req.body.store_code || "SHD").toUpperCase();
    const projectCode = (req.body.project_code || "").toUpperCase();
    if (!projectCode) {
      return res.status(400).json({ success: false, message: "project_code is required" });
    }
    const itemCount = Math.min(SAMPLE_PRODUCTS.length, Math.max(1, parseInt(req.body.item_count) || 3));

    // Generate a unique order id if caller didn't supply one
    let ordersIdorders = parseInt(req.body.orders_idorders);
    if (!ordersIdorders) {
      const last = await Order.findOne().sort({ orders_idorders: -1 }).select("orders_idorders");
      ordersIdorders = (last?.orders_idorders || 90000) + 1;
    }

    const existing = await Order.findOne({ orders_idorders: ordersIdorders });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Order #${ordersIdorders} already exists`,
      });
    }

    const orderDate = new Date();
    const deliveryDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // Pick N random distinct products from the catalog (Fisher–Yates partial shuffle)
    const pool = [...SAMPLE_PRODUCTS];
    for (let i = pool.length - 1; i > pool.length - 1 - itemCount; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picked = pool.slice(pool.length - itemCount);
    const products = picked.map((p, idx) => {
      const qty = 1 + ((ordersIdorders + idx) % 3); // 1..3
      return { ...p, qty };
    });

    const totalItems = products.reduce((s, p) => s + p.qty, 0);
    const totalAmount = products.reduce(
      (s, p) => s + p.qty * (p.product_offer_price || 0),
      0
    );

    // 1. Create the order
    const order = await Order.create({
      orders_idorders: ordersIdorders,
      store_code: storeCode,
      project_code: projectCode,
      order_date: orderDate,
      delivery_date: deliveryDate,
      total_items: totalItems,
      total_amount: Math.round(totalAmount * 100) / 100,
      status: "pending",
    });

    // 2. Create the items
    const itemDocs = products.map((p, idx) => ({
      _id: `test_${ordersIdorders}_${idx + 1}`,
      orders_idorders: ordersIdorders,
      store_code: storeCode,
      project_code: projectCode,
      p_code: p.p_code,
      barcode: p.barcode,
      item_name: p.item_name,
      pcode_img: p.pcode_img,
      pack_size: p.pack_size,
      ordered_quantity: p.qty,
      product_offer_price: p.product_offer_price,
      product_mrp: p.product_mrp,
      total_amt_our_price: p.qty * p.product_offer_price,
      total_amt_mrp: p.qty * p.product_mrp,
      order_date: orderDate,
      delivery_date: deliveryDate,
      product_picked_status: "Pending",
    }));
    await OrderItem.insertMany(itemDocs);

    // 3. Notify managers of this store
    notifyManagersOfNewOrder(order).catch((e) =>
      console.error("notifyManagersOfNewOrder failed:", e.message)
    );

    res.status(201).json({
      success: true,
      message: `Dummy order #${ordersIdorders} created`,
      data: {
        order,
        items: itemDocs,
      },
    });
  } catch (err) {
    console.error("createTestOrder failed:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/test/push-diagnose
 * No auth — call from browser or Postman to see exactly why FCM is failing.
 * Returns Firebase init status, FCM token state per user, and a live test send.
 */
exports.diagnosePush = async (req, res) => {
  const report = {};

  // 1. Check Firebase env vars
  report.env = {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? "SET" : "MISSING",
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? "SET" : "MISSING",
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? "SET" : "MISSING",
  };

  // 2. Check Firebase initialization
  try {
    const app = admin.app();
    report.firebase_initialized = true;
    report.firebase_project = app.options.credential ? "credential configured" : "no credential";
  } catch (e) {
    report.firebase_initialized = false;
    report.firebase_init_error = e.message;
  }

  // 3. Check FCM token status for all users
  const users = await PickerUser.find({}, "name email role fcm_token").lean();
  report.users = users.map((u) => ({
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    fcm_token: u.fcm_token
      ? `${u.fcm_token.slice(0, 20)}...` // show first 20 chars only
      : null,
    has_token: !!u.fcm_token,
  }));

  report.users_with_token = report.users.filter((u) => u.has_token).length;
  report.users_without_token = report.users.filter((u) => !u.has_token).length;

  // 4. Live test — send a push to the first user that has a token
  const target = users.find((u) => u.fcm_token);
  if (!target) {
    report.test_push = { skipped: true, reason: "No user has an FCM token in the database" };
  } else if (!report.firebase_initialized) {
    report.test_push = { skipped: true, reason: "Firebase not initialized" };
  } else {
    try {
      const messageId = await admin.messaging().send({
        token: target.fcm_token,
        notification: { title: "Push Test", body: "FCM is working!" },
        data: { type: "test" },
        android: {
          notification: { channelId: "picker_orders_v2", sound: "notification", priority: "max" },
        },
        apns: { payload: { aps: { sound: "notification.wav" } } },
      });
      report.test_push = {
        success: true,
        sent_to: `${target.name} (${target.email})`,
        message_id: messageId,
      };
    } catch (e) {
      report.test_push = {
        success: false,
        sent_to: `${target.name} (${target.email})`,
        error_code: e.code || "unknown",
        error_message: e.message,
      };
    }
  }

  res.json(report);
};

/**
 * POST /api/test/push-user/:id
 * Send a test FCM push to a specific user. No auth — dev/admin use only.
 */
exports.testPushToUser = async (req, res) => {
  try {
    const user = await PickerUser.findById(req.params.id).select("name email fcm_token").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!user.fcm_token)
      return res.status(400).json({ success: false, message: "User has no FCM token" });

    const messageId = await admin.messaging().send({
      token: user.fcm_token,
      notification: { title: "Test Push", body: `Admin test push to ${user.name}` },
      data: { type: "test" },
      android: {
        notification: { channelId: "picker_orders_v2", sound: "notification", priority: "max" },
      },
      apns: { payload: { aps: { sound: "notification.wav" } } },
    });

    res.json({ success: true, message_id: messageId, sent_to: user.email });
  } catch (e) {
    res.status(500).json({
      success: false,
      error_code: e.code || "unknown",
      error_message: e.message,
    });
  }
};

/**
 * GET /api/test/riders
 * List active riders (optionally filter by store_code / project_code). No auth.
 */
exports.listTestRiders = async (req, res) => {
  try {
    const storeCode = req.query.store_code
      ? String(req.query.store_code).toUpperCase()
      : null;
    const projectCode = req.query.project_code
      ? String(req.query.project_code).toUpperCase()
      : null;

    const filter = { role: "rider", is_active: true };
    if (storeCode) filter.store_codes = storeCode;
    if (projectCode) filter.project_code = projectCode;

    const riders = await PickerUser.find(filter)
      .select("name email phone store_codes project_code rider_availability")
      .sort({ name: 1 })
      .lean();

    res.json({ success: true, data: riders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/test/assign-rider
 * Dev shortcut: assign a rider to an order in one call. No auth.
 *
 * Body:
 *   orders_idorders (required)
 *   rider_id OR rider_email (required)
 *   prepare_order (optional) — mark order completed + ready_for_delivery
 *   replace_active (optional) — cancel any active delivery assignment first
 *   latitude, longitude (optional) — set on order when prepare_order is true
 */
exports.testAssignRider = async (req, res) => {
  try {
    const { orders_idorders, rider_id, rider_email, prepare_order, replace_active, latitude, longitude } =
      req.body;

    if (!orders_idorders) {
      return res.status(400).json({ success: false, message: "orders_idorders is required" });
    }
    if (!rider_id && !rider_email) {
      return res.status(400).json({
        success: false,
        message: "rider_id or rider_email is required",
      });
    }

    const result = await assignRiderToOrder({
      orders_idorders,
      rider_id,
      rider_email,
      prepare_order: !!prepare_order,
      replace_active: !!replace_active,
      latitude,
      longitude,
    });

    if (result.error) {
      return res.status(result.status || 400).json({ success: false, message: result.error });
    }

    res.status(201).json({
      success: true,
      message: `Rider assigned to order #${orders_idorders}`,
      data: {
        assignment: result.assignment,
        rider: result.rider,
        order: result.order,
      },
    });
  } catch (err) {
    console.error("testAssignRider failed:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

