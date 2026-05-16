// One-off migration: rename existing roles for the new RBAC layout.
//
//   store_manager           -> manager
//   super_admin (non-owner) -> admin   (mobile top-of-hierarchy)
//   super_admin (owner)     -> stays super_admin (web admin panel owner)
//
// The "owner" is identified by the seeded e-mail (see SUPER_ADMIN_EMAIL below).
// Idempotent — running it twice is a no-op.
//
// Run: node migrate-roles.js
require("dotenv").config();
const { MongoClient } = require("mongodb");

const MONGO_URI =
  process.env.PICKER_MONGO_URI ||
  "mongodb://picker_app:Picker%402026%23Secure@187.127.164.170:27017/picker_db?authSource=picker_db";

const SUPER_ADMIN_EMAIL = "superadmin@patelrmart.com";

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db("picker_db");
  const users = db.collection("picker_users");

  const before = {
    store_manager: await users.countDocuments({ role: "store_manager" }),
    super_admin: await users.countDocuments({ role: "super_admin" }),
    manager: await users.countDocuments({ role: "manager" }),
    admin: await users.countDocuments({ role: "admin" }),
    picker: await users.countDocuments({ role: "picker" }),
  };
  console.log("Before:", before);

  const r1 = await users.updateMany(
    { role: "store_manager" },
    { $set: { role: "manager", updated_at: new Date() } }
  );
  console.log(`store_manager -> manager: ${r1.modifiedCount}`);

  const r2 = await users.updateMany(
    { role: "super_admin", email: { $ne: SUPER_ADMIN_EMAIL.toLowerCase() } },
    { $set: { role: "admin", updated_at: new Date() } }
  );
  console.log(
    `super_admin (non-owner) -> admin: ${r2.modifiedCount}  (owner kept on ${SUPER_ADMIN_EMAIL})`
  );

  const after = {
    store_manager: await users.countDocuments({ role: "store_manager" }),
    super_admin: await users.countDocuments({ role: "super_admin" }),
    manager: await users.countDocuments({ role: "manager" }),
    admin: await users.countDocuments({ role: "admin" }),
    picker: await users.countDocuments({ role: "picker" }),
  };
  console.log("After: ", after);

  await client.close();
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
