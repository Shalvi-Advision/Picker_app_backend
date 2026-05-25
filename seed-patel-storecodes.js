// Bulk seed of Patel R-Mart store codes (from "Patel Storecode.csv").
//
// Idempotent:
//   - stores            : upsert by store_code
//   - picker_users      : skip if email already exists
//   - round_robin_state : upsert by { store_code, project_code }
//
// Run:  node seed-patel-storecodes.js
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");

const MONGO_URI =
  process.env.PICKER_MONGO_URI ||
  "mongodb://picker_app:Picker%402026%23Secure@187.127.164.170:27017/picker_db?authSource=picker_db";

const PROJECT_CODE = "RET3163";
const MANAGER_PASSWORD = "Manager@123";
const PICKER_PASSWORD = "Picker@123";

// Source: Patel Storecode.csv supplied by the user (2026-05-25).
const STORES = [
  { code: "AME",     outlet: "Shivaji Chowk, Ambernath (E)",                   address: "Jain Plaza, Shivaji Chowk, Ambernath - East." },
  { code: "AMW",     outlet: "Near MCA, Station Rd. Ambernath (W)",            address: "Opp. Ambernath Municipal Corporation, Station Road, Ambernath - West." },
  { code: "AMSN",    outlet: "Shivganga Nagar Ambernath (E)",                  address: "Mayflower Complex, Shiv-Ganga Nagar, Shiv-Mandir Road, Ambernath East" },
  { code: "AML",     outlet: "Laxmi Nagar (East)",                             address: "Near Gas Godown, Mahalaxminagar, Amb. - East." },
  { code: "AMPL",    outlet: "Palegaon Off Shiv Mandir Road",                  address: "Phase II Jainam Residency, Palegaon off Shiv Mandir Road, Ambarnath East 421501" },
  { code: "BLWB",    outlet: "Sanewadi Badlapur (W)",                          address: "Basement, Mandavkar Complex, Nr. SVC Bank, Sanewadi, Badlapur - West" },
  { code: "BKHE",    outlet: "Kharvai Naka, Badlapur (E)",                     address: "E2 Wing Commercial, Ushakiran Residency, Kharvai Naka, Matheran-Karjat Road, Badlapur E" },
  { code: "BLEB",    outlet: "Gandhi Chowk Badlapur (E)",                      address: "Basement, Vivekanand Arcade, Gandhi Chowk, Station Road, Badlapur - East" },
  { code: "BLEK",    outlet: "Katrap Naka Badlapur (E)",                       address: "Gr. Flr, Gan Neel Appts, Katrap Chowk, Badlapur - East" },
  { code: "ULN4",    outlet: "Venus Chowk, Ulhasnagar No.4",                   address: "Plot No 6-9 Venus Station Road, Ulhasnagar-4" },
  { code: "ULN",     outlet: "Ulhasnagar No.2",                                address: "Mukund Bldg., Opp. Kailash Complex, Aman Takies Road, Ulhasnagar-2" },
  { code: "SHD",     outlet: "Nr. Railway Stn. Shahad",                        address: "Omkar Complex, Nr Shahad Bridge, Shahad." },
  { code: "KLK",     outlet: "Khadkpada, Kalyan (W)",                          address: "Opp. Madhav Shrusti Complex, Khadakpada, Kalyan - West" },
  { code: "KLW",     outlet: "Rambaug Kalyan (W)",                             address: "Pranav Shopping Complex, Santoshi Mata Rd, Nr Maxi Ground, Rambaug, Kalyan - W" },
  { code: "KLT",     outlet: "Tilak Chowk, Kalyan (W)",                        address: "Cholkar Niwas, Near Tilak Chowk, Kalyan - W" },
  { code: "KLE",     outlet: "Netivili, Kalyan (E)",                           address: "Krishna Square, Opp. Lokgram Entrance, Near Bhima Shankar Temple, Shree Malang Road, Kalyan East" },
  { code: "DOEMIDC", outlet: "MIDC, Dombivli (E)",                             address: "Unique Plaza, Near Mamta Hosp., Residential Zone, MIDC Dombivli - East" },
  { code: "DOE",     outlet: "Rajaji Path, Dombivli (E)",                      address: "Gr. Flr, Vakratund CHSL, Near Swaminarayan Temple, Dombivli - East" },
  { code: "DOW",     outlet: "Kopar Rd. Dombivli (W)",                         address: "Babu Mhatre Chawl, Gala No. 1, 2 & 3, Opp. Muncipal Hosp, Kopar Road, Dombivli - West." },
  { code: "DOWSMT",  outlet: "Samrat Chowk, Dombivli (W)",                     address: "Basement, Shree Harsh Plaza, Samrat Chowk, Dombivli - West" },
  { code: "TTL",     outlet: "Ganesh Mandir Rd. Titwala (E)",                  address: "Regency Sarvam, Gupta Estate, Ganesh Mandir Road, Titwala - East" },
  { code: "MUBD",    outlet: "Sonar Pada, Murbad",                             address: "Shop No 3 to 5, Murbadkar Bldg, Sonar Pada Nr Haritage School, Kalyan Murbad Rd" },
  { code: "SHAP",    outlet: "Nr. S.T. Depot, Shahapur",                       address: "Pandit Naka, Near ST Bus Depot, Shahapur." },
  { code: "PRCAME",  outlet: "Shivaji Chowk (East)",                           address: "Shivaji Chowk Opp Patel R Mart, Ambernath (E)" },
  { code: "PRCAMEN", outlet: "Sawant Arcade (East)",                           address: "Sawant Arcade, Station Road, Ambernath East" },
  { code: "AMCH",    outlet: "Badlapur-Kalyan Rd, Chikhloli Ambernath West",   address: "Badlapur-Kalyan Rd, Chikhloli Ambernath West" },
  { code: "DOF",     outlet: "Phadke Rd. Dombivli (E)",                        address: "Phadke Road, Near Ganpati Mandir, Dombivli (E)." },
  { code: "BWM",     outlet: "Ganesh Chowk Manjari",                           address: "Ganesh Chowk Manjari" },
  { code: "KKW",     outlet: "Shankeshwar Plantina Koliwali Road",             address: "Shankeshwar Plantina, Shop No 1/2/3, Koliwali Road Nr KDMC Water Tank" },
  { code: "DOM",     outlet: "Manpada Road Dombivli (E)",                      address: "Manpada Road Nr Ice Factory, Survey No 14/4,5 of Village G-B, Dombivli" },
  { code: "DWK",     outlet: "Kumbharkhan Pada Dombivli (W)",                  address: "Mhatre Complex, Opp Pragati Sankul, Subhash Rd, Kumbharkhan Pada, Dombivli (W)" },
  { code: "KHP",     outlet: "Khopoli Phata",                                  address: "Khopoli Phata, besides SBI Bank, Khopoli East" },
  { code: "BES",     outlet: "Surval Chowk",                                   address: "Surval Heights B Wing, Surval Chowk, MIDC Shirgaon, Badlapur East 421503" },
  { code: "BHAR",    outlet: "Parekh Timber Mart Compound",                    address: "Parekh Timber Mart Compound, House No 293, Behind Indusind Bank, Kaneri, Agra Road, Bhiwandi" },
  { code: "BAP",     outlet: "Hari Om Timber Mart Compound",                   address: "212/2, Hari Om Timber Mart Compound, Near Bank of Maharashtra, Kamatghar Anjur Phata, Agra Road, Bhiwandi - 421302" },
  { code: "VAS",     outlet: "Old Agra Road near Chaubal Wada (Vasind)",       address: "Old Agra Road near Chaubal Wada (Bhere Maidan), Vasind 421601" },
  { code: "VGW",     outlet: "Vangani",                                        address: "Karjat Badlapur Road, near Poonam Hotel, Vangani East 421503" },
  { code: "KMR",     outlet: "Khoni MIDC Road",                                address: "Shop No 114/1, Opp Nisarag Hotel, Khoni MIDC Road" },
  { code: "DSR",     outlet: "Diva Shill Road",                                address: "Ser No 158/1, Diva Shill Road, Opp Sudama Regency, Thane - 400612" },
  { code: "PAD",     outlet: "Motiram Residency, Om Sai Nagar",                address: "Motiram Residency .02, Gr No. 2008, Om Sai Nagar, Central Bank Padgha" },
  { code: "KET",     outlet: "Ashtami CHS, Vijaynagar",                        address: "Ashtami CHS, Vijaynagar, Tisgaon, Near St Thomas School, Kalyan (E)" },
  { code: "NKR",     outlet: "Badlapur-Karjat Road Tiwale",                    address: "Badlapur-Karjat Road, Tiwale Hotel, Opp Neral Police Station" },
  { code: "BBVR",    outlet: "Nana Nani Park Bhiwandi",                        address: "Adarsh Park, Bagwan Vasu Road, Nr Nana Nani Park, Bhiwandi 421302" },
  { code: "KBR",     outlet: "Utsav Lodge, Ranjnoli, Bhiwandi",                address: "Ground, Shop No.2, Survey No.5/5, Kalyan Road, Next to Utsav Lodge, Ranjnoli, Bhiwandi" },
  { code: "NWM",     outlet: "Nice World Mumbra",                              address: "Shop No 1,2,3 Wing No 01, Nice World Mumbra" },
  { code: "DNE",     outlet: "Nandivili, Dombivli (E)",                        address: "Shop No 1,2,3,4 Dhruv Pada Bldg, Nana Saheb Dharmadhikari Road, Nanadwali, Dombivali (E)" },
  { code: "DAG",     outlet: "Azde Gaon Dombivli East",                        address: "Shop No 4,5,6,7, Plot No 4, City Mall, Near Pednekar College, Azde Gaon, Dombivli East 421203" },
  { code: "AVB",     outlet: "Ambadi Village Bhiwandi",                        address: "House No 118, Near Zidka God, Ambadi Village, Bhiwandi 421302" },
  { code: "KYD",     outlet: "Yogi Dham Kalyan (W)",                           address: "Shop No 28,29,30, New Era, Yogi Dham, Kalyan (W) 421301" },
  { code: "KUD",     outlet: "Wada Road, Kudus",                               address: "Jaya Chhaya Complex, Behind SBI Bank, Near Coco Cola Gate No 1, Wada Road, Kudus, Bhiwandi 421302" },
  { code: "NSR",     outlet: "Nilje Station Road",                             address: "Nilje Goan, Survey No 33/1/B, Nr Chandresh Himalaya CHS Building, Nilje Station Road 421204" },
  { code: "TGR",     outlet: "Goveli Road nr Icon Lawn Titwala (East)",        address: "Goveli Road nr Icon Lawn, Titwala (East) 421605" },
  { code: "DER",     outlet: "Rajaji Path Lane No. 1",                         address: "Ground Floor, Kudaldeshkar Bhavan, Plot No. 38, Kudaldeshkar The Dombivli Co-operative Housing Society Ltd., Rajaji Path Lane No. 1, Pin 421201" },
  { code: "THE",     outlet: "90 Ft Road Thakurli East",                       address: "Shop 1,2,3, Govind Hight, Off 90 Ft Road, Thakurli East, Next Ganraj Hight Building 421201" },
  { code: "RCM",     outlet: "Mohopada",                                       address: "Plot No 34/B/6, Ganesh Nagar Rees Chambarali, Dand Mohopada Road, beside Apurva Hotel 410222" },
];

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log(`Connected to picker_db (${STORES.length} stores in source)\n`);
  const db = client.db("picker_db");

  // ─── 1. stores collection ────────────────────────────────────────────────
  let storesUpserted = 0;
  for (const s of STORES) {
    const r = await db.collection("stores").updateOne(
      { store_code: s.code },
      {
        $set: {
          store_code: s.code,
          outlet_name: s.outlet,
          address: s.address,
          project_code: PROJECT_CODE,
          is_active: true,
          updated_at: new Date(),
        },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true }
    );
    if (r.upsertedCount || r.modifiedCount) storesUpserted++;
  }
  await db.collection("stores").createIndex({ store_code: 1 }, { unique: true });
  console.log(`stores: ${storesUpserted} upserted / ${STORES.length} total`);

  // ─── 2. picker_users (1 manager + 2 pickers per store, idempotent) ──────
  const managerHash = await bcrypt.hash(MANAGER_PASSWORD, 10);
  const pickerHash = await bcrypt.hash(PICKER_PASSWORD, 10);

  let insertedUsers = 0;
  let skippedUsers = 0;

  for (const s of STORES) {
    const code = s.code;
    const lower = code.toLowerCase();

    const candidates = [
      {
        name: `Manager ${code}`,
        email: `manager.${lower}@patelrmart.com`,
        role: "manager",
        password: managerHash,
      },
      {
        name: `Picker ${code} 1`,
        email: `picker1.${lower}@patelrmart.com`,
        role: "picker",
        password: pickerHash,
      },
      {
        name: `Picker ${code} 2`,
        email: `picker2.${lower}@patelrmart.com`,
        role: "picker",
        password: pickerHash,
      },
    ];

    for (const u of candidates) {
      const exists = await db.collection("picker_users").findOne({ email: u.email });
      if (exists) {
        skippedUsers++;
        continue;
      }
      await db.collection("picker_users").insertOne({
        _id: new ObjectId(),
        name: u.name,
        email: u.email,
        phone: `90000${Math.floor(Math.random() * 90000) + 10000}`,
        password: u.password,
        role: u.role,
        store_codes: [code],
        project_code: PROJECT_CODE,
        fcm_token: null,
        is_active: true,
        capability_overrides: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      insertedUsers++;
    }
  }
  console.log(`picker_users: ${insertedUsers} inserted, ${skippedUsers} skipped (existed)`);

  // ─── 3. round_robin_state per store ─────────────────────────────────────
  let rrUpserted = 0;
  for (const s of STORES) {
    const pickers = await db
      .collection("picker_users")
      .find({ role: "picker", store_codes: s.code, is_active: true })
      .toArray();
    const pickerIds = pickers.map((p) => p._id);

    const r = await db.collection("round_robin_state").updateOne(
      { store_code: s.code, project_code: PROJECT_CODE },
      {
        $set: {
          picker_queue: pickerIds,
          updated_at: new Date(),
        },
        $setOnInsert: {
          store_code: s.code,
          project_code: PROJECT_CODE,
          last_assigned_picker_index: -1,
        },
      },
      { upsert: true }
    );
    if (r.upsertedCount || r.modifiedCount) rrUpserted++;
  }
  await db
    .collection("round_robin_state")
    .createIndex({ store_code: 1, project_code: 1 }, { unique: true });
  console.log(`round_robin_state: ${rrUpserted} upserted / ${STORES.length} total\n`);

  // ─── Summary ────────────────────────────────────────────────────────────
  const totalUsers = await db.collection("picker_users").countDocuments();
  const totalManagers = await db.collection("picker_users").countDocuments({ role: "manager" });
  const totalPickers = await db.collection("picker_users").countDocuments({ role: "picker" });
  console.log("DB totals:");
  console.log(`  picker_users      : ${totalUsers}  (managers: ${totalManagers}, pickers: ${totalPickers})`);
  console.log(`  stores            : ${await db.collection("stores").countDocuments()}`);
  console.log(`  round_robin_state : ${await db.collection("round_robin_state").countDocuments()}`);

  console.log("\nCredentials pattern:");
  console.log(`  manager.<code>@patelrmart.com  -->  ${MANAGER_PASSWORD}`);
  console.log(`  picker1.<code>@patelrmart.com  -->  ${PICKER_PASSWORD}`);
  console.log(`  picker2.<code>@patelrmart.com  -->  ${PICKER_PASSWORD}`);
  console.log(`  (<code> lowercased — e.g. manager.ame@patelrmart.com)`);

  await client.close();
  console.log("\nDone.");
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
