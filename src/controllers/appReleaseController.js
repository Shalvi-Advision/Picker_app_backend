const path = require("path");
const fs = require("fs");
const multer = require("multer");

const DOWNLOADS_DIR = path.join(__dirname, "../../public/downloads");
const VERSION_FILE = path.join(__dirname, "../../public/version.json");

if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function readVersion() {
  return fs.existsSync(VERSION_FILE) ? JSON.parse(fs.readFileSync(VERSION_FILE, "utf8")) : {};
}

function writeVersion(data) {
  fs.writeFileSync(VERSION_FILE, JSON.stringify(data, null, 2));
}

// ── Multer storage ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DOWNLOADS_DIR),
  filename: (req, _file, cb) => {
    const code = req.body.version_code || "unknown";
    cb(null, `picker_v${code}.apk`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith(".apk")) cb(null, true);
    else cb(new Error("Only .apk files are allowed"));
  },
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
});

exports.upload = upload;

// ── GET /api/app/version  (public — called by mobile app) ─────────────────────
exports.getPublicVersion = (_req, res) => {
  if (!fs.existsSync(VERSION_FILE)) {
    return res.json({ update_channel: "none", version_code: 0, version_name: "0.0.0" });
  }
  res.json(readVersion());
};

// ── GET /api/super-admin/app-release ─────────────────────────────────────────
exports.getCurrentRelease = (_req, res) => {
  if (!fs.existsSync(VERSION_FILE)) return res.json({ success: true, data: null });
  res.json({ success: true, data: readVersion() });
};

// ── PUT /api/super-admin/app-release/channel  (switch active channel) ─────────
exports.setChannel = (req, res) => {
  const { channel } = req.body;
  if (!["apk", "store", "none"].includes(channel)) {
    return res.status(400).json({ success: false, message: "channel must be apk, store, or none" });
  }
  const updated = { ...readVersion(), update_channel: channel };
  writeVersion(updated);
  res.json({ success: true, data: updated });
};

// ── POST /api/super-admin/app-release  (upload APK + save APK config) ─────────
exports.publishRelease = (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "APK file is required" });

  const { version_code, version_name, release_notes, apk_force_update } = req.body;
  if (!version_code || !version_name) {
    return res.status(400).json({ success: false, message: "version_code and version_name are required" });
  }

  const baseUrl = (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
  const apkUrl = `${baseUrl}/downloads/picker_v${version_code}.apk`;

  // Preserve store config fields already saved; only overwrite APK fields
  const existing = readVersion();
  const updated = {
    ...existing,
    update_channel: existing.update_channel || "none",
    version_code: parseInt(version_code, 10),
    version_name: version_name.trim(),
    apk_url: apkUrl,
    apk_force_update: apk_force_update === "true" || apk_force_update === true,
    release_notes: (release_notes || "").trim(),
    published_at: new Date().toISOString(),
    file_size_mb: (req.file.size / (1024 * 1024)).toFixed(2),
  };

  writeVersion(updated);
  res.json({ success: true, data: updated });
};

// ── PUT /api/super-admin/app-release/store-config  (save store config) ────────
exports.updateStoreConfig = (req, res) => {
  const {
    android_latest_version, android_review_version,
    ios_latest_version, ios_review_version,
    play_store_url, app_store_url, store_force_update,
  } = req.body;

  // Preserve APK fields; only overwrite store fields
  const updated = {
    ...readVersion(),
    android_latest_version: (android_latest_version || "").trim(),
    android_review_version: (android_review_version || "").trim(),
    ios_latest_version: (ios_latest_version || "").trim(),
    ios_review_version: (ios_review_version || "").trim(),
    play_store_url: (play_store_url || "").trim(),
    app_store_url: (app_store_url || "").trim(),
    store_force_update: store_force_update === true || store_force_update === "true",
  };

  writeVersion(updated);
  res.json({ success: true, data: updated });
};

// ── DELETE /api/super-admin/app-release/:filename ─────────────────────────────
exports.deleteApk = (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(DOWNLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: "File not found" });
  fs.unlinkSync(filePath);
  res.json({ success: true });
};

// ── GET /api/super-admin/app-release/files ────────────────────────────────────
exports.listApks = (_req, res) => {
  const files = fs.existsSync(DOWNLOADS_DIR)
    ? fs.readdirSync(DOWNLOADS_DIR)
        .filter((f) => f.endsWith(".apk"))
        .map((f) => {
          const stat = fs.statSync(path.join(DOWNLOADS_DIR, f));
          return { name: f, size_mb: (stat.size / (1024 * 1024)).toFixed(2), uploaded_at: stat.mtime };
        })
        .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))
    : [];
  res.json({ success: true, data: files });
};
