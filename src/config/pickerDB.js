const mongoose = require("mongoose");

let isConnected = false;

const connectPickerDB = async () => {
  if (isConnected) return;
  await mongoose.connect(process.env.PICKER_MONGO_URI);
  isConnected = true;
  console.log("Picker DB connected");
};

module.exports = connectPickerDB;
