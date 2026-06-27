const ProjectStore = require("../models/ProjectStore");
const PickerUser   = require("../models/PickerUser");

// GET /super-admin/project-stores
// Returns all project codes, each with its store codes and user counts.
exports.listProjectStores = async (_req, res) => {
  try {
    const rows = await ProjectStore.find().sort({ project_code: 1, store_code: 1 }).lean();

    // Group by project_code
    const map = {};
    for (const row of rows) {
      if (!map[row.project_code]) map[row.project_code] = { project_code: row.project_code, stores: [] };
      map[row.project_code].stores.push({
        _id: row._id,
        store_code: row.store_code,
        latitude: row.latitude,
        longitude: row.longitude,
        address: row.address,
      });
    }

    // Attach user counts per (project_code, store_code) in one query
    const storeCodes = rows.map((r) => r.store_code);
    const users = await PickerUser.find(
      { store_codes: { $in: storeCodes }, role: { $in: ["picker", "manager"] } },
      { name: 1, role: 1, store_codes: 1, project_code: 1, is_active: 1 }
    ).lean();

    // Count per (project_code, store_code) pair
    const counts = {};
    for (const u of users) {
      for (const sc of u.store_codes) {
        const key = `${u.project_code}||${sc}`;
        counts[key] = (counts[key] || 0) + 1;
      }
    }

    const result = Object.values(map).map((proj) => ({
      project_code: proj.project_code,
      stores: proj.stores.map((s) => ({
        _id: s._id,
        store_code: s.store_code,
        latitude: s.latitude ?? null,
        longitude: s.longitude ?? null,
        address: s.address ?? null,
        user_count: counts[`${proj.project_code}||${s.store_code}`] || 0,
      })),
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /super-admin/project-stores
// Body: { project_code, store_code }
exports.createProjectStore = async (req, res) => {
  try {
    const { project_code, store_code } = req.body;
    if (!project_code || !store_code) {
      return res.status(400).json({ success: false, message: "project_code and store_code are required" });
    }
    const doc = await ProjectStore.create({
      project_code: project_code.trim().toUpperCase(),
      store_code:   store_code.trim().toUpperCase(),
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "This project_code + store_code pair already exists" });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /super-admin/project-stores/:id
exports.deleteProjectStore = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ProjectStore.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ success: false, message: "Mapping not found" });
    res.json({ success: true, message: "Mapping deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /super-admin/project-stores/:id
// Body: { latitude?, longitude?, address? }
exports.updateProjectStore = async (req, res) => {
  try {
    const { latitude, longitude, address } = req.body;
    const updates = {};
    if (latitude !== undefined) updates.latitude = latitude ? String(latitude).trim() : null;
    if (longitude !== undefined) updates.longitude = longitude ? String(longitude).trim() : null;
    if (address !== undefined) updates.address = address ? String(address).trim() : null;

    const doc = await ProjectStore.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!doc) {
      return res.status(404).json({ success: false, message: "Mapping not found" });
    }
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /super-admin/project-stores/:project_code/stores/:store_code/users
// Returns all pickers and managers assigned to the given project+store.
exports.getStoreUsers = async (req, res) => {
  try {
    const { project_code, store_code } = req.params;
    const users = await PickerUser.find({
      project_code: project_code.toUpperCase(),
      store_codes:  store_code.toUpperCase(),
      role: { $in: ["picker", "manager"] },
    })
      .select("-password")
      .sort({ role: 1, name: 1 })
      .lean();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
