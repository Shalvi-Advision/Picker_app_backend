const { buildOsmDirectionsUrl } = require("../utils/osmUrls");

const DEFAULT_OSRM = "https://router.project-osrm.org";

function getOsrmBaseUrl() {
  return (process.env.OSRM_BASE_URL || DEFAULT_OSRM).replace(/\/$/, "");
}

/**
 * Road-network ETA and polyline via OSRM (open source).
 * Falls back to null on error so callers can use haversine.
 */
async function getOsrmRouteMetrics(origin, orderedStops) {
  if (!orderedStops.length) return null;

  const coords = [];
  if (origin) coords.push(`${origin.lng},${origin.lat}`);
  for (const s of orderedStops) {
    coords.push(`${s.lng},${s.lat}`);
  }

  const url = `${getOsrmBaseUrl()}/route/v1/driving/${coords.join(";")}?overview=full&geometries=geojson&steps=false`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("[osrm] HTTP", res.status);
      return null;
    }
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) {
      console.warn("[osrm] API code:", data.code);
      return null;
    }

    const route = data.routes[0];
    const geometry = route.geometry?.coordinates || [];
    const polyline = geometry.map(([lng, lat]) => ({ lat, lng }));

    return {
      estimated_distance_km: Math.round((route.distance / 1000) * 10) / 10,
      estimated_duration_min: Math.max(1, Math.round(route.duration / 60)),
      eta_source: "osrm",
      polyline,
      encoded_polyline: null,
      maps_url: buildOsmDirectionsUrl(origin, orderedStops),
    };
  } catch (err) {
    console.error("[osrm] request failed:", err.message);
    return null;
  }
}

module.exports = {
  getOsrmRouteMetrics,
};
