/**
 * Haversine distance calculation & dynamic progressive radius discovery
 */

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);

  if (
    !Number.isFinite(nLat1) ||
    !Number.isFinite(nLon1) ||
    !Number.isFinite(nLat2) ||
    !Number.isFinite(nLon2)
  ) {
    return null;
  }

  const R = 6371; // Earth radius in km
  const dLat = toRadians(nLat2 - nLat1);
  const dLon = toRadians(nLon2 - nLon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(nLat1)) *
      Math.cos(toRadians(nLat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isPharmacyOpenNow(openingTime, closingTime) {
  if (!openingTime || !closingTime) return null;
  const [openH, openM] = openingTime.split(":").map(Number);
  const [closeH, closeM] = closingTime.split(":").map(Number);
  if (
    !Number.isFinite(openH) ||
    !Number.isFinite(openM) ||
    !Number.isFinite(closeH) ||
    !Number.isFinite(closeM)
  ) {
    return null;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  if (closeMinutes >= openMinutes) {
    return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  }
  // Overnight schedule (e.g. 20:00 to 06:00)
  return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
}

/**
 * Progressive radius discovery:
 * Starts at 3 km and expands progressively to 5 km -> 10 km when insufficient results exist,
 * or respects an explicit manual radius (e.g. 3, 5, 10, 20, 50, or "all").
 */
function progressiveRadiusDiscovery(items, extractPharmacy, options = {}) {
  const {
    lat,
    lng,
    radiusKm = 3,
    autoExpand = true,
    minResults = 1,
    steps = [3, 5, 10]
  } = options;

  const hasUserCoords =
    lat !== undefined &&
    lng !== undefined &&
    lat !== null &&
    lng !== null &&
    lat !== "" &&
    lng !== "" &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng));

  // Attach distance and open/closed status to each item
  const withDistance = items.map(item => {
    const pharmacy = extractPharmacy(item);
    const distance =
      hasUserCoords &&
      pharmacy &&
      pharmacy.latitude != null &&
      pharmacy.longitude != null
        ? calculateDistanceKm(lat, lng, pharmacy.latitude, pharmacy.longitude)
        : null;

    const isOpen = pharmacy
      ? isPharmacyOpenNow(pharmacy.openingTime, pharmacy.closingTime)
      : null;

    return {
      ...item,
      distance,
      isOpen
    };
  });

  // Sort nearest first; null distances last
  withDistance.sort((a, b) => {
    if (a.distance == null && b.distance == null) return 0;
    if (a.distance == null) return 1;
    if (b.distance == null) return -1;
    return a.distance - b.distance;
  });

  if (!hasUserCoords || radiusKm === "all") {
    return {
      results: withDistance,
      initialRadiusKm: radiusKm === "all" ? null : Number(radiusKm) || 3,
      appliedRadiusKm: null,
      wasExpanded: false,
      expansionStepsTried: [],
      hasMoreOutsideRadius: false,
      totalAvailableEverywhere: withDistance.length
    };
  }

  const requestedRadius = Number(radiusKm) || 3;
  const candidateSteps = autoExpand
    ? Array.from(new Set([requestedRadius, ...steps.filter(s => s >= requestedRadius)])).sort(
        (a, b) => a - b
      )
    : [requestedRadius];

  let appliedRadius = requestedRadius;
  let filtered = [];
  const triedSteps = [];

  for (const stepRadius of candidateSteps) {
    triedSteps.push(stepRadius);
    appliedRadius = stepRadius;
    filtered = withDistance.filter(
      item => item.distance != null && item.distance <= stepRadius
    );
    if (filtered.length >= minResults) {
      break;
    }
  }

  return {
    results: filtered,
    initialRadiusKm: requestedRadius,
    appliedRadiusKm: appliedRadius,
    wasExpanded: appliedRadius > requestedRadius && filtered.length > 0,
    expansionStepsTried: triedSteps,
    hasMoreOutsideRadius: withDistance.length > filtered.length,
    nearestAvailableDistanceKm:
      withDistance.length > 0 && withDistance[0].distance != null
        ? Number(withDistance[0].distance.toFixed(2))
        : null,
    totalAvailableEverywhere: withDistance.length
  };
}

module.exports = {
  calculateDistanceKm,
  isPharmacyOpenNow,
  progressiveRadiusDiscovery
};
