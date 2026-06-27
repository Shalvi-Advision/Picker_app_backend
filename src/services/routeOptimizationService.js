const ProjectStore = require("../models/ProjectStore");

const ROAD_FACTOR = 1.3;
const AVG_SPEED_KMH = 25;
const MAX_STOPS = 4;
const MIN_STOPS = 2;

function parseCoord(lat, lng) {
  const la = parseFloat(lat);
  const lo = parseFloat(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return { lat: la, lng: lo };
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Nearest-neighbor ordering from store origin through all stops.
 * @param {{ lat: number, lng: number } | null} origin
 * @param {Array<{ orders_idorders: number, lat: number, lng: number }>} stops
 * @param {number[] | null} manualOrder - optional explicit order of orders_idorders
 */
function suggestStopOrder(origin, stops, manualOrder = null) {
  if (manualOrder && manualOrder.length) {
    const byId = Object.fromEntries(stops.map((s) => [s.orders_idorders, s]));
    return manualOrder.map((id) => byId[id]).filter(Boolean);
  }

  const remaining = [...stops];
  const ordered = [];
  let current = origin;

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = current
        ? haversineKm(current, { lat: remaining[i].lat, lng: remaining[i].lng })
        : 0;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    current = { lat: next.lat, lng: next.lng };
  }
  return ordered;
}

function estimateRouteMetrics(origin, orderedStops) {
  if (!orderedStops.length) {
    return {
      estimated_distance_km: 0,
      estimated_duration_min: 0,
      eta_source: "haversine",
      polyline: [],
      encoded_polyline: null,
    };
  }

  let totalKm = 0;
  let prev = origin;
  const polyline = [];
  if (origin) polyline.push({ lat: origin.lat, lng: origin.lng });
  for (const stop of orderedStops) {
    const point = { lat: stop.lat, lng: stop.lng };
    if (prev) totalKm += haversineKm(prev, point);
    polyline.push(point);
    prev = point;
  }

  const roadKm = totalKm * ROAD_FACTOR;
  const durationMin = Math.max(5, Math.round((roadKm / AVG_SPEED_KMH) * 60));
  return {
    estimated_distance_km: Math.round(roadKm * 10) / 10,
    estimated_duration_min: durationMin,
    eta_source: "haversine",
    polyline,
    encoded_polyline: null,
    maps_url: buildGoogleMapsDirectionsUrl(origin, orderedStops),
  };
}

async function estimateRouteMetricsAsync(origin, orderedStops) {
  const { getGoogleDirectionsMetrics } = require("./googleDirectionsService");
  const google = await getGoogleDirectionsMetrics(origin, orderedStops);
  if (google) return google;
  return estimateRouteMetrics(origin, orderedStops);
}

function buildGoogleMapsDirectionsUrl(origin, orderedStops, riderPosition = null) {
  if (!orderedStops.length) return null;

  const points = orderedStops.map((s) => `${s.lat},${s.lng}`);
  const destination = points.pop();
  const start =
    riderPosition != null
      ? `${riderPosition.lat},${riderPosition.lng}`
      : origin != null
        ? `${origin.lat},${origin.lng}`
        : null;

  const params = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
  if (start) params.set("origin", start);
  if (points.length) params.set("waypoints", points.join("|"));

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

async function getStoreOrigin(projectCode, storeCode) {
  const row = await ProjectStore.findOne({
    project_code: String(projectCode).toUpperCase(),
    store_code: String(storeCode).toUpperCase(),
  }).lean();

  if (!row) return null;
  return parseCoord(row.latitude, row.longitude);
}

function stopsFromOrders(orders) {
  return orders.map((o) => {
    const c = parseCoord(o.latitude, o.longitude);
    return {
      orders_idorders: o.orders_idorders,
      lat: c?.lat ?? 0,
      lng: c?.lng ?? 0,
      latitude: o.latitude,
      longitude: o.longitude,
      delivery_details: o.delivery_details,
      delivery_slot: o.delivery_slot,
      delivery_date: o.delivery_date,
    };
  });
}

module.exports = {
  MIN_STOPS,
  MAX_STOPS,
  parseCoord,
  haversineKm,
  suggestStopOrder,
  estimateRouteMetrics,
  estimateRouteMetricsAsync,
  buildGoogleMapsDirectionsUrl,
  getStoreOrigin,
  stopsFromOrders,
};
