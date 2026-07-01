// One-off script to create (or update) the super admin user.
// Run: node seed-super-admin.js
require("dotenv").config();
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

const MONGO_URI =
  "mongodb://picker_app:Picker%402026%23Secure@187.127.164.170:27017/picker_db?authSource=picker_db";

const SUPER_ADMIN = {
  name: "Super Admin",
  email: "superadmin@sarm.com",
  phone: "9000000000",
  role: "super_admin",
  store_codes: [],
  project_code: "RET3163",
  fcm_token: null,
  is_active: true,
};
const PASSWORD = "Admin@123";

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db("picker_db");
  const users = db.collection("picker_users");

  const hashed = await bcrypt.hash(PASSWORD, 10);

  const existing = await users.findOne({ email: SUPER_ADMIN.email });
  if (existing) {
    await users.updateOne(
      { _id: existing._id },
      {
        $set: {
          ...SUPER_ADMIN,
          password: hashed,
          updated_at: new Date(),
        },
      }
    );
    console.log(`Updated super admin ${SUPER_ADMIN.email}`);
  } else {
    await users.insertOne({
      ...SUPER_ADMIN,
      password: hashed,
      created_at: new Date(),
    });
    console.log(`Created super admin ${SUPER_ADMIN.email}`);
  }

  console.log("Login:");
  console.log(`  email    : ${SUPER_ADMIN.email}`);
  console.log(`  password : ${PASSWORD}`);

  await client.close();
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
