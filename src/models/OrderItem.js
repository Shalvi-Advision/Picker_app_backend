const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    _id: { type: String },
    orders_idorders: { type: Number, required: true },
    store_code: { type: String, required: true },
    project_code: { type: String, required: true },
    department_name: String,
    category_name: String,
    sub_category_name: String,
    p_code: String,
    barcode: String,
    item_name: String,
    product_description: String,
    pack_size: String,
    ordered_quantity: Number,
    product_offer_price: Number,
    product_mrp: Number,
    total_amt_our_price: Number,
    total_amt_mrp: Number,
    sell_rate_with_discount: Number,
    order_date: Date,
    delivery_date: String,
    pcode_img: { type: String, default: null },
    product_picked_status: { type: String, default: "Pending" },
    delivery_details: { type: String, default: null },
    latitude: { type: String, default: null },
    longitude: { type: String, default: null },
    synced_at: { type: Date, default: Date.now },
  },
  { _id: false, timestamps: false }
);

orderItemSchema.index({ orders_idorders: 1, store_code: 1 });
orderItemSchema.index({ store_code: 1, product_picked_status: 1 });

module.exports = mongoose.model("OrderItem", orderItemSchema, "order_items");
