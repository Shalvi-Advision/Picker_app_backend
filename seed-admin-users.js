// Script to create admin users for mobile app access
// Run: node seed-admin-users.js
require("dotenv").config();
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

const MONGO_URI =
  "mongodb://picker_app:Picker%402026%23Secure@187.127.164.170:27017/picker_db?authSource=picker_db";

// Define admin users for mobile app
const ADMIN_USERS = [
  {
    name: "Admin User 1",
    email: "admin1@patelrmart.com",
    phone: "9000000001",
    role: "admin",
    store_codes: [], // Unscoped - can access all stores
    project_code: "RET3163",
    fcm_token: null,
    is_active: true,
    password: "Admin@123",
  },
  {
    name: "Admin User 2",
    email: "admin2@patelrmart.com",
    phone: "9000000002",
    role: "admin",
    store_codes: [], // Unscoped - can access all stores
    project_code: "RET3163",
    fcm_token: null,
    is_active: true,
    password: "Admin@123",
  },
  {
    name: "Admin User 3",
    email: "admin3@patelrmart.com",
    phone: "9000000003",
    role: "admin",
    store_codes: [], // Unscoped - can access all stores
    project_code: "RET3163",
    fcm_token: null,
    is_active: true,
    password: "Admin@123",
  },
];

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log("Connected to picker_db");

  const db = client.db("picker_db");
  const users = db.collection("picker_users");

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const adminUser of ADMIN_USERS) {
    const { password, ...userData } = adminUser;
    const hashed = await bcrypt.hash(password, 10);

    const existing = await users.findOne({ email: adminUser.email });
    if (existing) {
      // Check if it's already an admin
      if (existing.role === "admin") {
        console.log(`⏭  Skipped: ${adminUser.email} (already exists as admin)`);
        skipped++;
      } else {
        // Update existing user to admin role
        await users.updateOne(
          { _id: existing._id },
          {
            $set: {
              ...userData,
              password: hashed,
              updated_at: new Date(),
            },
          }
        );
        console.log(`✓ Updated: ${adminUser.email} (role changed to admin)`);
        updated++;
      }
    } else {
      // Create new admin user
      await users.insertOne({
        ...userData,
        password: hashed,
        created_at: new Date(),
      });
      console.log(`✓ Created: ${adminUser.email}`);
      created++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("Admin Users Seed Complete");
  console.log("=".repeat(50));
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log("\nDefault Login Credentials:");
  console.log("  Password: Admin@123");
  console.log("\nAdmin Users:");
  ADMIN_USERS.forEach((admin) => {
    console.log(`  - ${admin.email} (${admin.name})`);
  });
  console.log("\nThese admin users can:");
  console.log("  ✓ Login to mobile app");
  console.log("  ✓ View all stores (unscoped access)");
  console.log("  ✓ Access dashboard features");

  await client.close();
}

run().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
