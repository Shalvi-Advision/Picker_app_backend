const path = require("path");
const fs = require("fs");
const multer = require("multer");
const DeliveryAssignment = require("../models/DeliveryAssignment");
const DeliveryRoute = require("../models/DeliveryRoute");
const Order = require("../models/Order");
const PickerUser = require("../models/PickerUser");
const Notification = require("../models/Notification");
const { sendToUser } = require("../services/notificationService");
const {
  onAssignmentStarted,
  onAssignmentFinished,
} = require("../services/deliveryRouteService");
const { notifyUpstreamDelivered } = require("../services/upstreamDeliveryService");
const { NOTIFICATION_TYPES } = require("../constants/notificationTypes");
const {
  getStoreOrigin,
  buildOsmDirectionsUrl,
} = require("../services/routeOptimizationService");

function otpEnabled() {
  return process.env.DELIVERY_OTP_ENABLED === "true";
}

function generateOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const podDir = path.join(__dirname, "../../public/uploads/pod");
fs.mkdirSync(podDir, { recursive: true });

const podStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, podDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `pod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const podUpload = multer({
  storage: podStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && (file.mimetype.startsWith("image/") || file.mimetype === "application/octet-stream")) {
      return cb(null, true);
    }
    cb(new Error("Only image uploads are allowed"));
  },
});

exports.podUpload = podUpload;

function podPublicUrl(req, filename) {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  return `${base.replace(/\/$/, "")}/uploads/pod/${filename}`;
}

exports.uploadPodPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Photo file is required" });
    }
    res.json({
      success: true,
      data: { url: podPublicUrl(req, req.file.filename) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMyDeliveries = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { rider_id: req.user._id };
    if (status) filter.status = status;

    const assignments = await DeliveryAssignment.find(filter).sort({ assigned_at: -1 });
    const orderIds = assignments.map((a) => a.orders_idorders);
    const orders = await Order.find({ orders_idorders: { $in: orderIds } });
    const ordersMap = Object.fromEntries(orders.map((o) => [o.orders_idorders, o]));

    const result = assignments.map((a) => ({
      ...a.toObject(),
      assignment_id: a._id,
      order: ordersMap[a.orders_idorders] || null,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getDeliveryDetail = async (req, res) => {
  try {
    const orderId = Number(req.params.orders_idorders);
    const assignment = await DeliveryAssignment.findOne({
      orders_idorders: orderId,
      rider_id: req.user._id,
      status: { $nin: ["cancelled"] },
    }).sort({ assigned_at: -1 });

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Delivery assignment not found" });
    }

    const order = await Order.findOne({ orders_idorders: orderId });
    res.json({
      success: true,
      data: {
        assignment,
        order,
        otp_required: otpEnabled() && assignment.status === "out_for_delivery",
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.startDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await DeliveryAssignment.findOneAndUpdate(
      { _id: id, rider_id: req.user._id, status: "assigned" },
      {
        status: "out_for_delivery",
        started_at: new Date(),
        ...(otpEnabled() ? { delivery_otp: generateOtp() } : {}),
      },
      { new: true }
    );

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found or already started",
      });
    }

    await Order.updateOne(
      { orders_idorders: assignment.orders_idorders },
      { delivery_status: "out_for_delivery" }
    );

    await onAssignmentStarted(assignment);

    notifyManagersOfDeliveryEvent(assignment, "started", req.user).catch((e) =>
      console.error("notifyManagersOfDeliveryEvent failed:", e.message)
    );

    res.json({ success: true, data: assignment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.completeDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const { photo_urls, notes, recipient_name, latitude, longitude, signature_url, otp } =
      req.body;

    const urls = Array.isArray(photo_urls)
      ? photo_urls.filter((u) => typeof u === "string" && u.trim())
      : [];
    if (!urls.length) {
      return res.status(400).json({
        success: false,
        message: "At least one proof-of-delivery photo is required",
      });
    }

    const assignment = await DeliveryAssignment.findOne({
      _id: id,
      rider_id: req.user._id,
      status: "out_for_delivery",
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "No out-for-delivery assignment found",
      });
    }

    if (otpEnabled()) {
      const code = String(otp || "").trim();
      if (!code || code !== assignment.delivery_otp) {
        return res.status(400).json({
          success: false,
          message: "Invalid delivery OTP — ask the customer for their code",
        });
      }
    }

    assignment.status = "delivered";
    assignment.delivered_at = new Date();
    assignment.proof_of_delivery = {
      photo_urls: urls,
      signature_url: signature_url?.trim() || null,
      notes: notes?.trim() || null,
      recipient_name: recipient_name?.trim() || null,
      latitude: latitude != null ? String(latitude) : null,
      longitude: longitude != null ? String(longitude) : null,
      captured_at: new Date(),
    };
    assignment.delivery_otp = null;
    await assignment.save();

    await Order.updateOne(
      { orders_idorders: assignment.orders_idorders },
      { delivery_status: "delivered" }
    );

    await onAssignmentFinished(assignment, "delivered");

    const order = await Order.findOne({ orders_idorders: assignment.orders_idorders });
    notifyUpstreamDelivered(order, assignment, req.user).catch((e) =>
      console.error("notifyUpstreamDelivered failed:", e.message)
    );

    notifyManagersOfDeliveryEvent(assignment, "completed", req.user).catch((e) =>
      console.error("notifyManagersOfDeliveryEvent failed:", e.message)
    );

    res.json({ success: true, message: "Delivery completed", data: assignment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.failDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ success: false, message: "Failure reason is required" });
    }

    const assignment = await DeliveryAssignment.findOneAndUpdate(
      {
        _id: id,
        rider_id: req.user._id,
        status: { $in: ["assigned", "out_for_delivery"] },
      },
      { status: "failed", failed_reason: String(reason).trim() },
      { new: true }
    );

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    await Order.updateOne(
      { orders_idorders: assignment.orders_idorders },
      { delivery_status: "failed" }
    );

    await onAssignmentFinished(assignment, "failed");

    notifyManagersOfDeliveryEvent(assignment, "failed", req.user, reason).catch((e) =>
      console.error("notifyManagersOfDeliveryEvent failed:", e.message)
    );

    res.json({ success: true, data: assignment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.setMyAvailability = async (req, res) => {
  try {
    const { online } = req.body;
    if (typeof online !== "boolean") {
      return res.status(400).json({ success: false, message: "online boolean required" });
    }

    const updated = await PickerUser.findOneAndUpdate(
      { _id: req.user._id, role: "rider" },
      { rider_availability: online ? "online" : "offline" },
      { new: true }
    ).select("-password");

    if (!updated) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateMyLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({ success: false, message: "latitude and longitude are required" });
    }

    const updated = await PickerUser.findOneAndUpdate(
      { _id: req.user._id, role: "rider" },
      {
        last_location: {
          latitude: String(latitude),
          longitude: String(longitude),
          updated_at: new Date(),
        },
      },
      { new: true }
    ).select("-password");

    if (!updated) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    res.json({ success: true, data: updated.last_location });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMyNotifications = async (req, res) => {
  try {
    const { unread_only } = req.query;
    const filter = { user_id: req.user._id };
    if (unread_only === "true") filter.read = false;
    const list = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
    const unreadCount = await Notification.countDocuments({
      user_id: req.user._id,
      read: false,
    });
    res.json({ success: true, data: list, unread_count: unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markMyNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === "all") {
      await Notification.updateMany({ user_id: req.user._id, read: false }, { read: true });
      return res.json({ success: true, message: "All marked as read" });
    }
    const n = await Notification.findOneAndUpdate(
      { _id: id, user_id: req.user._id },
      { read: true },
      { new: true }
    );
    if (!n) return res.status(404).json({ success: false, message: "Notification not found" });
    res.json({ success: true, data: n });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

async function buildRiderRoutePayload(route, riderId) {
  const orderIds = route.stops.map((s) => s.orders_idorders);
  const [orders, assignments] = await Promise.all([
    Order.find({ orders_idorders: { $in: orderIds } }).lean(),
    DeliveryAssignment.find({ route_id: route._id, rider_id: riderId }).lean(),
  ]);
  const ordersMap = Object.fromEntries(orders.map((o) => [o.orders_idorders, o]));
  const assignMap = Object.fromEntries(assignments.map((a) => [a.orders_idorders, a]));

  const origin = await getStoreOrigin(route.project_code, route.store_code);
  const coordStops = route.stops
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => {
      const c = parseFloat(s.latitude);
      const lo = parseFloat(s.longitude);
      if (!Number.isFinite(c) || !Number.isFinite(lo)) return null;
      return { lat: c, lng: lo };
    })
    .filter(Boolean);

  const pendingCount = route.stops.filter((s) => s.status === "pending").length;
  const currentStop = route.stops
    .sort((a, b) => a.sequence - b.sequence)
    .find((s) => s.status === "pending");

  return {
    ...route.toObject ? route.toObject() : route,
    stops: route.stops
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => ({
        ...s,
        order: ordersMap[s.orders_idorders] || null,
        assignment: assignMap[s.orders_idorders] || null,
      })),
    pending_stops: pendingCount,
    current_stop: currentStop || null,
    maps_url: buildOsmDirectionsUrl(origin, coordStops),
    store_origin: origin,
  };
}

exports.getActiveRoute = async (req, res) => {
  try {
    const route = await DeliveryRoute.findOne({
      rider_id: req.user._id,
      status: { $in: ["planned", "in_progress"] },
    }).sort({ createdAt: -1 });

    if (!route) {
      return res.json({ success: true, data: null });
    }

    const data = await buildRiderRoutePayload(route, req.user._id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRoute = async (req, res) => {
  try {
    const route = await DeliveryRoute.findOne({
      _id: req.params.id,
      rider_id: req.user._id,
    });

    if (!route) {
      return res.status(404).json({ success: false, message: "Route not found" });
    }

    const data = await buildRiderRoutePayload(route, req.user._id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

async function notifyManagersOfDeliveryEvent(assignment, event, rider, reason) {
  const order = await Order.findOne({ orders_idorders: assignment.orders_idorders });
  if (!order) return;

  const managers = await PickerUser.find({
    role: "manager",
    store_codes: order.store_code,
  }).select("_id");

  const titles = {
    started: "Out for delivery",
    completed: "Delivery completed",
    failed: "Delivery failed",
  };
  const bodies = {
    started: `Order #${order.orders_idorders} is out for delivery with ${rider.name}.`,
    completed: `Order #${order.orders_idorders} delivered by ${rider.name}.`,
    failed: `Order #${order.orders_idorders} delivery failed: ${reason || "No reason"}`,
  };

  await Promise.all(
    managers.map((m) =>
      sendToUser(
        m._id,
        titles[event] || "Delivery update",
        bodies[event] || `Order #${order.orders_idorders} delivery updated.`,
        {
          orders_idorders: String(order.orders_idorders),
          store_code: order.store_code,
          rider_name: rider.name || "",
          event,
        },
        event === "completed"
          ? NOTIFICATION_TYPES.DELIVERY_COMPLETED
          : event === "failed"
            ? NOTIFICATION_TYPES.DELIVERY_FAILED
            : NOTIFICATION_TYPES.DELIVERY_STARTED
      )
    )
  );
}
