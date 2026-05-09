require("dotenv").config();
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

const MONGO_URI =
  "mongodb://picker_app:Picker%402026%23Secure@187.127.164.170:27017/picker_db?authSource=picker_db";

const DEFAULT_PASSWORDS = {
  store_manager: "Manager@123",
  picker: "Picker@123",
};

async function setPasswords() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db("picker_db");

  const users = await db.collection("picker_users").find({}).toArray();

  for (const user of users) {
    const plain = DEFAULT_PASSWORDS[user.role];
    const hashed = await bcrypt.hash(plain, 10);
    await db.collection("picker_users").updateOne(
      { _id: user._id },
      { $set: { password: hashed } }
    );
    console.log(`Set password for ${user.email} (${user.role})`);
  }

  console.log("\nDone. Passwords:");
  console.log("  store_manager → Manager@123");
  console.log("  picker        → Picker@123");

  await client.close();
}

setPasswords().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
