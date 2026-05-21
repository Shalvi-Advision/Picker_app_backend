// Script to verify admin users in the database
// Run: node verify-admin-users.js
require("dotenv").config();
const { MongoClient } = require("mongodb");

const MONGO_URI =
  "mongodb://picker_app:Picker%402026%23Secure@187.127.164.170:27017/picker_db?authSource=picker_db";

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log("Connected to picker_db\n");

  const db = client.db("picker_db");
  const users = db.collection("picker_users");

  // Find all admin users
  const adminUsers = await users
    .find({ role: "admin" })
    .project({ password: 0 }) // Exclude password from results
    .toArray();

  console.log("=".repeat(60));
  console.log("ADMIN USERS (Mobile App Access)");
  console.log("=".repeat(60));

  if (adminUsers.length === 0) {
    console.log("No admin users found.");
  } else {
    adminUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Phone: ${user.phone}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Store Codes: ${user.store_codes.length > 0 ? user.store_codes.join(", ") : "All (Unscoped)"}`);
      console.log(`   Project Code: ${user.project_code}`);
      console.log(`   Active: ${user.is_active ? "Yes" : "No"}`);
      console.log(`   Created: ${user.created_at ? user.created_at.toISOString() : "N/A"}`);
    });
  }

  // Also show super admin for reference
  const superAdmins = await users
    .find({ role: "super_admin" })
    .project({ password: 0 })
    .toArray();

  console.log("\n" + "=".repeat(60));
  console.log("SUPER ADMIN USERS (Web Admin Panel Only)");
  console.log("=".repeat(60));

  if (superAdmins.length === 0) {
    console.log("No super admin users found.");
  } else {
    superAdmins.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   ⚠️  Cannot login to mobile app`);
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Total Admin Users: ${adminUsers.length}`);
  console.log(`Total Super Admin Users: ${superAdmins.length}`);
  console.log("=".repeat(60) + "\n");

  await client.close();
}

run().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
