const { admin } = require("../config/firebase");
const PickerUser = require("../models/PickerUser");
const Notification = require("../models/Notification");

const sendToUser = async (userId, title, body, data = {}, type = "info") => {
  // 1. Persist an in-app notification record (always — even if FCM fails or
  //    the user has no token).
  try {
    await Notification.create({
      user_id: userId,
      title,
      body,
      type,
      metadata: data,
    });
  } catch (err) {
    console.error("[notification] DB persist failed:", err.message);
  }

  // 2. Try to deliver an FCM push.
  try {
    const user = await PickerUser.findById(userId).select("fcm_token name");
    if (!user?.fcm_token) {
      console.warn(`[notification] user ${userId} has no FCM token — skipping push`);
      return;
    }
    await admin.messaging().send({
      token: user.fcm_token,
      notification: { title, body },
      data: { ...data, type },
      android: {
        notification: {
          channelId: "picker_orders_v2",
          sound: "notification",
          priority: "max",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "notification.wav",
            badge: 1,
          },
        },
      },
    });
    console.log(`[notification] FCM push sent → user ${userId} (${user.name}): "${title}"`);
  } catch (err) {
    const staleTokenCodes = [
      "messaging/registration-token-not-registered",
      "messaging/invalid-registration-token",
      "messaging/invalid-argument",
    ];
    const isStale =
      staleTokenCodes.includes(err.code) ||
      (err.message || "").includes("Requested entity was not found");

    if (isStale) {
      console.warn(`[notification] stale FCM token for user ${userId} — clearing from DB`);
      await PickerUser.findByIdAndUpdate(userId, { fcm_token: null }).catch(() => {});
    } else {
      console.error(`[notification] FCM push failed → user ${userId}: [${err.code || "unknown"}] ${err.message}`);
    }
  }
};

/**
 * Notify all managers of a store that a new order has arrived.
 * Called immediately after order creation so managers are informed even if
 * round-robin assignment later fails (no active pickers).
 */
const notifyManagersOfNewOrder = async (order) => {
  const managers = await PickerUser.find({
    role: "manager",
    store_codes: order.store_code,
  }).select("_id");

  if (!managers.length) {
    console.warn(`[notification] no managers found for store ${order.store_code} — skipping new-order notification`);
    return;
  }

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
};

module.exports = { sendToUser, notifyManagersOfNewOrder };
