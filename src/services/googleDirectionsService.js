const { buildGoogleMapsDirectionsUrl } = require("./routeOptimizationService");

/** Decode Google encoded polyline → [{ lat, lng }, …] */
function decodePolyline(encoded) {
  if (!encoded) return [];
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function coordStr(point) {
  return `${point.lat},${point.lng}`;
}

/**
 * Traffic-aware ETA via Google Directions API.
 * Requires GOOGLE_MAPS_API_KEY with Directions API enabled.
 */
async function getGoogleDirectionsMetrics(origin, orderedStops) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !orderedStops?.length) return null;

  const chain = [];
  if (origin) chain.push(origin);
  for (const s of orderedStops) chain.push({ lat: s.lat, lng: s.lng });

  if (chain.length < 2) return null;

  const destination = chain[chain.length - 1];
  const start = chain[0];
  const waypoints = chain.slice(1, -1);

  const params = new URLSearchParams({
    origin: coordStr(start),
    destination: coordStr(destination),
    mode: "driving",
    departure_time: "now",
    key,
  });
  if (waypoints.length) {
    params.set("waypoints", waypoints.map(coordStr).join("|"));
  }

  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`);
    const data = await res.json();
    if (data.status !== "OK" || !data.routes?.[0]) {
      console.warn("[google-directions] API status:", data.status, data.error_message || "");
      return null;
    }

    const route = data.routes[0];
    let totalMeters = 0;
    let totalSeconds = 0;
    for (const leg of route.legs || []) {
      totalMeters += leg.distance?.value || 0;
      totalSeconds += leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0;
    }

    const polyline = decodePolyline(route.overview_polyline?.points);

    return {
      estimated_distance_km: Math.round((totalMeters / 1000) * 10) / 10,
      estimated_duration_min: Math.max(5, Math.round(totalSeconds / 60)),
      eta_source: "google_traffic",
      polyline,
      encoded_polyline: route.overview_polyline?.points || null,
      maps_url: buildGoogleMapsDirectionsUrl(origin, orderedStops),
    };
  } catch (err) {
    console.error("[google-directions] request failed:", err.message);
    return null;
  }
}

module.exports = {
  decodePolyline,
  getGoogleDirectionsMetrics,
};
