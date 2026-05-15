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
    console.error("Notification persist failed:", err.message);
  }

  // 2. Try to deliver an FCM push.
  try {
    const user = await PickerUser.findById(userId).select("fcm_token name");
    if (!user?.fcm_token) return;
    await admin.messaging().send({
      token: user.fcm_token,
      notification: { title, body },
      data: { ...data, type },
    });
  } catch (err) {
    console.error("FCM send failed:", err.message);
  }
};

module.exports = { sendToUser };
