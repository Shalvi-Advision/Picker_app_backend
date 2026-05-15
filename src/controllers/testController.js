const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const PickerUser = require("../models/PickerUser");
const { sendToUser } = require("../services/notificationService");

const SAMPLE_PRODUCTS = [
  { p_code: "TEST001", barcode: "8901000000001", item_name: "Test Dairy Milk 100g", pack_size: "100 GM", product_offer_price: 75, product_mrp: 80 },
  { p_code: "TEST002", barcode: "8901000000002", item_name: "Test Atta 5 Kg", pack_size: "5 KG", product_offer_price: 245, product_mrp: 280 },
  { p_code: "TEST003", barcode: "8901000000003", item_name: "Test Refined Oil 1L", pack_size: "1 LT", product_offer_price: 165, product_mrp: 195 },
  { p_code: "TEST004", barcode: "8901000000004", item_name: "Test Tea 250g", pack_size: "250 GM", product_offer_price: 130, product_mrp: 150 },
  { p_code: "TEST005", barcode: "8901000000005", item_name: "Test Basmati Rice 1Kg", pack_size: "1 KG", product_offer_price: 105, product_mrp: 120 },
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
    const projectCode = req.body.project_code || "RET3163";
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

    const products = SAMPLE_PRODUCTS.slice(0, itemCount).map((p, idx) => {
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
 * Fan-out push + persisted notification to every manager whose store_codes
 * include the new order's store_code.
 *
 * Reusable — call this from any future order-ingestion path.
 */
async function notifyManagersOfNewOrder(order) {
  const managers = await PickerUser.find({
    role: "store_manager",
    store_codes: order.store_code,
  }).select("_id");

  await Promise.all(
    managers.map((m) =>
      sendToUser(
        m._id,
        "New order received",
        `Order #${order.orders_idorders} (${order.store_code}) — ${order.total_items} item${order.total_items === 1 ? "" : "s"}, ₹${order.total_amount}`,
        {
          orders_idorders: String(order.orders_idorders),
          store_code: order.store_code,
          total_items: String(order.total_items),
          total_amount: String(order.total_amount),
        },
        "order_received"
      )
    )
  );
}

exports.notifyManagersOfNewOrder = notifyManagersOfNewOrder;
