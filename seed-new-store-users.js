const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");

const MONGO_URI =
  "mongodb://picker_app:Picker%402026%23Secure@187.127.164.170:27017/picker_db?authSource=picker_db";

const NEW_STORES = ["SHD", "BLEK", "AME"];

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log("Connected to picker_db");

  const db = client.db("picker_db");

  const managerHash = await bcrypt.hash("Manager@123", 10);
  const pickerHash = await bcrypt.hash("Picker@123", 10);

  const newUsers = [];

  for (const store of NEW_STORES) {
    newUsers.push({
      _id: new ObjectId(),
      name: `Manager ${store}`,
      email: `manager.${store.toLowerCase()}@patelrmart.com`,
      phone: null,
      role: "store_manager",
      store_codes: [store],
      project_code: "RET3163",
      password: managerHash,
      fcm_token: null,
      is_active: true,
      created_at: new Date(),
    });

    for (let i = 1; i <= 2; i++) {
      newUsers.push({
        _id: new ObjectId(),
        name: `Picker ${store} ${i}`,
        email: `picker${i}.${store.toLowerCase()}@patelrmart.com`,
        phone: null,
        role: "picker",
        store_codes: [store],
        project_code: "RET3163",
        password: pickerHash,
        fcm_token: null,
        is_active: true,
        created_at: new Date(),
      });
    }
  }

  // Insert users (skip if email already exists)
  let inserted = 0;
  let skipped = 0;
  for (const user of newUsers) {
    const exists = await db.collection("picker_users").findOne({ email: user.email });
    if (exists) {
      console.log(`  SKIP (exists): ${user.email}`);
      skipped++;
    } else {
      await db.collection("picker_users").insertOne(user);
      console.log(`  INSERT: ${user.email} [${user.role}]`);
      inserted++;
    }
  }

  console.log(`\nUsers: ${inserted} inserted, ${skipped} skipped`);

  // Update round_robin_state for each store with the new pickers
  for (const store of NEW_STORES) {
    const pickers = await db.collection("picker_users").find({
      role: "picker",
      store_codes: store,
      is_active: true,
    }).toArray();

    const pickerIds = pickers.map((p) => p._id);

    const result = await db.collection("round_robin_state").updateOne(
      { store_code: store },
      {
        $set: {
          picker_queue: pickerIds,
          last_assigned_picker_index: -1,
          updated_at: new Date(),
        },
      }
    );

    console.log(`round_robin_state [${store}]: queue updated with ${pickerIds.length} picker(s) — matched: ${result.matchedCount}`);
  }

  await client.close();
  console.log("\nDone.");
  console.log("\nCredentials:");
  for (const store of NEW_STORES) {
    console.log(`  manager.${store.toLowerCase()}@patelrmart.com  →  Manager@123  [store_manager]`);
    console.log(`  picker1.${store.toLowerCase()}@patelrmart.com  →  Picker@123   [picker]`);
    console.log(`  picker2.${store.toLowerCase()}@patelrmart.com  →  Picker@123   [picker]`);
  }
}

run().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
