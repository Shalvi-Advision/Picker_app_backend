function buildOsmPointUrl(lat, lng) {
  const la = parseFloat(lat);
  const lo = parseFloat(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=16/${la}/${lo}`;
}

/**
 * OpenStreetMap directions (OSRM car engine via fossgis).
 * @param {{ lat: number, lng: number } | null} origin
 * @param {Array<{ lat: number, lng: number }>} orderedStops
 * @param {{ lat: number, lng: number } | null} riderPosition
 */
function buildOsmDirectionsUrl(origin, orderedStops, riderPosition = null) {
  if (!orderedStops?.length) return null;

  const routePoints = [];
  const start =
    riderPosition != null ? riderPosition : origin != null ? origin : null;
  if (start) routePoints.push(`${start.lat},${start.lng}`);
  for (const s of orderedStops) {
    routePoints.push(`${s.lat},${s.lng}`);
  }

  const routeParam = routePoints.join(";");
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${routeParam}`;
}

module.exports = {
  buildOsmPointUrl,
  buildOsmDirectionsUrl,
};
