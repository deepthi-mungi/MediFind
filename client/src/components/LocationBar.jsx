import { useState } from "react";

const CITY_PRESETS = [
  { label: "Hyderabad (Central)", latitude: 17.385, longitude: 78.4867 },
  { label: "Bengaluru (MG Road)", latitude: 12.9716, longitude: 77.5946 },
  { label: "Mumbai (Andheri)", latitude: 19.1136, longitude: 72.8697 },
  { label: "Chennai (T. Nagar)", latitude: 13.0418, longitude: 80.2341 },
  { label: "New Delhi (Connaught Place)", latitude: 28.6315, longitude: 77.2167 },
  { label: "Warangal", latitude: 17.9689, longitude: 79.5941 },
  { label: "Visakhapatnam", latitude: 17.6868, longitude: 83.2185 },
  { label: "Pune", latitude: 18.5204, longitude: 73.8567 }
];

function LocationBar({
  customerLocation,
  onUpdateLocation,
  onDetectGPS,
  detectingGPS,
  locationPermissionError
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [placeResults, setPlaceResults] = useState([]);
  const [manualLat, setManualLat] = useState(
    customerLocation?.latitude ?? ""
  );
  const [manualLng, setManualLng] = useState(
    customerLocation?.longitude ?? ""
  );
  const [manualLabel, setManualLabel] = useState(
    customerLocation?.label || ""
  );

  async function handleSearchPlace(e) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchingPlace(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(
          searchQuery.trim()
        )}`
      );
      const data = await response.json();
      if (Array.isArray(data)) {
        setPlaceResults(
          data.map(item => ({
            label: item.display_name.split(",").slice(0, 3).join(", "),
            latitude: Number(item.lat),
            longitude: Number(item.lon)
          }))
        );
      }
    } catch {
      setPlaceResults([]);
    } finally {
      setSearchingPlace(false);
    }
  }

  function selectLocation(loc, mode = "manual") {
    onUpdateLocation({
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      label:
        loc.label ||
        `${Number(loc.latitude).toFixed(4)}, ${Number(loc.longitude).toFixed(4)}`,
      mode
    });
    setModalOpen(false);
  }

  function handleSaveManualCoords(e) {
    e.preventDefault();
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180
    ) {
      return;
    }
    selectLocation(
      {
        latitude: lat,
        longitude: lng,
        label:
          manualLabel.trim() || `Custom (${lat.toFixed(4)}, ${lng.toFixed(4)})`
      },
      "manual"
    );
  }

  return (
    <div className="location-bar-container">
      <div className="location-bar">
        <div className="location-status">
          <span className="loc-pin-icon">📍</span>
          <div>
            <span className="loc-caption">
              {customerLocation
                ? customerLocation.mode === "manual"
                  ? "Manual Location Active"
                  : "Live GPS Location Active"
                : "Location Not Set"}
            </span>
            <strong className="loc-title">
              {customerLocation
                ? customerLocation.label ||
                  `${Number(customerLocation.latitude).toFixed(4)}, ${Number(
                    customerLocation.longitude
                  ).toFixed(4)}`
                : "Detect GPS or select your area manually"}
            </strong>
          </div>
        </div>

        <div className="location-actions">
          <button
            type="button"
            className="loc-btn detect-btn"
            disabled={detectingGPS}
            onClick={onDetectGPS}
          >
            {detectingGPS ? "Detecting GPS..." : "🎯 Auto-Detect GPS"}
          </button>

          <button
            type="button"
            className="loc-btn manual-btn"
            onClick={() => {
              setManualLat(customerLocation?.latitude ?? "");
              setManualLng(customerLocation?.longitude ?? "");
              setManualLabel(customerLocation?.label || "");
              setModalOpen(true);
            }}
          >
            🗺️ Select Location Manually
          </button>
        </div>
      </div>

      {locationPermissionError && (
        <div className="location-permission-alert">
          <span>
            ⚠️ Browser location permission was denied or unavailable. You can
            still search or{" "}
            <button
              type="button"
              className="inline-link-btn"
              onClick={() => setModalOpen(true)}
            >
              choose your location manually
            </button>
            .
          </span>
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div
            className="modal-card location-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Select Your Location</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form className="place-search-form" onSubmit={handleSearchPlace}>
              <input
                placeholder="Search city, area, or pincode (e.g., Banjara Hills, Hyderabad)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <button type="submit" disabled={searchingPlace}>
                {searchingPlace ? "Searching..." : "Search Area"}
              </button>
            </form>

            {placeResults.length > 0 && (
              <div className="place-results-list">
                {placeResults.map((place, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="place-result-item"
                    onClick={() => selectLocation(place, "manual")}
                  >
                    <span>📍 {place.label}</span>
                    <small>
                      {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
                    </small>
                  </button>
                ))}
              </div>
            )}

            <div className="preset-cities-section">
              <h4>Quick Select Area / City</h4>
              <div className="preset-pills">
                {CITY_PRESETS.map(city => (
                  <button
                    key={city.label}
                    type="button"
                    className="pill"
                    onClick={() => selectLocation(city, "manual")}
                  >
                    {city.label}
                  </button>
                ))}
              </div>
            </div>

            <form
              className="manual-coords-form"
              onSubmit={handleSaveManualCoords}
            >
              <h4>Or Enter Exact GPS Coordinates</h4>
              <input
                placeholder="Location Label (e.g. Home / Office)"
                value={manualLabel}
                onChange={e => setManualLabel(e.target.value)}
              />
              <div className="coordinate-row">
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="Latitude (e.g. 17.3850)"
                  value={manualLat}
                  onChange={e => setManualLat(e.target.value)}
                />
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="Longitude (e.g. 78.4867)"
                  value={manualLng}
                  onChange={e => setManualLng(e.target.value)}
                />
              </div>
              <button type="submit" className="primary-action">
                Apply Manual Coordinates
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default LocationBar;
