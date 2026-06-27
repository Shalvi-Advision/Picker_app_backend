require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const connectPickerDB = require("./config/pickerDB");
const { initFirebase } = require("./config/firebase");
const seedRolePermissions = require("./services/seedRolePermissions");

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// Serve APK downloads publicly (no auth — Flutter app needs direct download URL)
app.use("/downloads", express.static(path.join(__dirname, "../public/downloads")));
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/picker", require("./routes/picker.routes"));
app.use("/api/manager", require("./routes/manager.routes"));
app.use("/api/rider", require("./routes/rider.routes"));
app.use("/api/super-admin", require("./routes/superAdmin.routes"));
app.use("/api/webhook", require("./routes/webhook.routes"));
app.use("/api/test", require("./routes/test.routes"));

// Public version endpoint — Flutter app polls this on launch
const { getPublicVersion } = require("./controllers/appReleaseController");
app.get("/api/app/version", getPublicVersion);

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
