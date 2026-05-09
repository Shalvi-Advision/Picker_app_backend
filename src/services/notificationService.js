const { admin } = require("../config/firebase");
const PickerUser = require("../models/PickerUser");

const sendToUser = async (userId, title, body, data = {}) => {
  try {
    const user = await PickerUser.findById(userId).select("fcm_token name");
    if (!user?.fcm_token) return;

    await admin.messaging().send({
      token: user.fcm_token,
      notification: { title, body },
      data,
    });
  } catch (err) {
    console.error("FCM send failed:", err.message);
  }
};

module.exports = { sendToUser };
