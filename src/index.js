require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const connectPickerDB = require("./config/pickerDB");
const { initFirebase } = require("./config/firebase");
const seedRolePermissions = require("./services/seedRolePermissions");

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/picker", require("./routes/picker.routes"));
app.use("/api/manager", require("./routes/manager.routes"));
app.use("/api/super-admin", require("./routes/superAdmin.routes"));
app.use("/api/webhook", require("./routes/webhook.routes"));
app.use("/api/test", require("./routes/test.routes"));

app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date() }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Internal server error" });
});

const PORT = process.env.PORT || 3000;

const start = async () => {
  await connectPickerDB();
  initFirebase();
  await seedRolePermissions();
  app.listen(PORT, () => console.log(`Picker API running on port ${PORT}`));
};

start().catch((err) => {
  console.error("Startup failed:", err.message);
  process.exit(1);
});
