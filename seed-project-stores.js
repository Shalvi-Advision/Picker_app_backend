/**
 * One-time migration: seed project_stores from existing picker_users.
 * Reads every (project_code, store_code) pair used by pickers/managers
 * and inserts unique pairs into the project_stores collection.
 */

const { MongoClient } = require("mongodb");

const MONGO_URI =
  "mongodb://picker_app:Picker%402026%23Secure@187.127.164.170:27017/picker_db?authSource=picker_db";

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log("Connected to DB");

  const db = client.db("picker_db");
  const users = db.collection("picker_users");
  const projectStores = db.collection("project_stores");

  // Ensure unique index exists
  await projectStores.createIndex(
    { project_code: 1, store_code: 1 },
    { unique: true }
  );

  // Collect all unique (project_code, store_code) pairs from users
  const allUsers = await users
    .find(
      { role: { $in: ["picker", "manager"] }, project_code: { $exists: true, $ne: "" } },
      { projection: { project_code: 1, store_codes: 1 } }
    )
    .toArray();

  const pairs = new Map();
  for (const u of allUsers) {
    const pc = (u.project_code || "").trim().toUpperCase();
    if (!pc) continue;
    for (const sc of (u.store_codes || [])) {
      const s = (sc || "").trim().toUpperCase();
      if (!s) continue;
      pairs.set(`${pc}||${s}`, { project_code: pc, store_code: s });
    }
  }

  console.log(`Found ${pairs.size} unique (project_code, store_code) pairs`);

  let inserted = 0;
  let skipped  = 0;
  for (const doc of pairs.values()) {
    try {
      await projectStores.insertOne({ ...doc, createdAt: new Date(), updatedAt: new Date() });
      console.log(`  + ${doc.project_code} → ${doc.store_code}`);
      inserted++;
    } catch (err) {
      if (err.code === 11000) {
        console.log(`  ~ ${doc.project_code} → ${doc.store_code} (already exists, skipped)`);
        skipped++;
      } else {
        throw err;
      }
    }
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
