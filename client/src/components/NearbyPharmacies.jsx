import { useEffect, useState, useCallback } from "react";
import InteractiveMap from "./InteractiveMap";

function NearbyPharmacies({
  apiRequest,
  notify,
  customerLocation,
  onSelectPharmacy
}) {
  const [pharmacies, setPharmacies] = useState([]);
  const [radiusMeta, setRadiusMeta] = useState(null);
  const [radiusKm, setRadiusKm] = useState(3);
  const [autoExpand, setAutoExpand] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(true);

  const fetchNearby = useCallback(
    async (
      selectedRadius = radiusKm,
      selectedAutoExpand = autoExpand,
      queryText = searchQuery
    ) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (customerLocation?.latitude != null && customerLocation?.longitude != null) {
          params.set("lat", customerLocation.latitude);
          params.set("lng", customerLocation.longitude);
        }
        params.set("radiusKm", String(selectedRadius));
        params.set("autoExpand", String(selectedAutoExpand));
        if (queryText.trim()) {
          params.set("search", queryText.trim());
        }

        const data = await apiRequest(`/api/pharmacy/nearby?${params.toString()}`);
        setPharmacies(Array.isArray(data.pharmacies) ? data.pharmacies : []);
        setRadiusMeta(data.radiusMeta || null);
      } catch (error) {
        notify(error.message || "Unable to fetch nearby pharmacies.");
      } finally {
        setLoading(false);
      }
    },
    [apiRequest, autoExpand, customerLocation, notify, radiusKm, searchQuery]
  );

  useEffect(() => {
    fetchNearby(radiusKm, autoExpand, searchQuery);
  }, [customerLocation, fetchNearby, radiusKm, autoExpand, searchQuery]);

  function handleRadiusSelect(newRadius, enableAuto = false) {
    setRadiusKm(newRadius);
    setAutoExpand(enableAuto);
  }

  return (
    <section className="dashboard nearby-section">
      <div className="section-header-flex">
        <div>
          <h2>🏥 Nearby Verified Pharmacies</h2>
          <p className="section-subtitle">
            Starts with a 3 km radius and automatically expands to 5 km and 10 km
            when needed.
          </p>
        </div>

        <button
          type="button"
          className="toggle-map-btn"
          onClick={() => setShowMap(prev => !prev)}
        >
          {showMap ? "🗺️ Hide Interactive Map" : "🗺️ Show Interactive Map"}
        </button>
      </div>

      {/* Radius & Discovery Controls */}
      <div className="nearby-search discovery-bar">
        <div className="filter-pills">
          <button
            type="button"
            className={radiusKm === 3 && autoExpand ? "pill active" : "pill"}
            onClick={() => handleRadiusSelect(3, true)}
          >
            ⚡ Smart 3 km (Auto-Expand)
          </button>
          <button
            type="button"
            className={radiusKm === 3 && !autoExpand ? "pill active" : "pill"}
            onClick={() => handleRadiusSelect(3, false)}
          >
            Within 3 km
          </button>
          <button
            type="button"
            className={radiusKm === 5 && !autoExpand ? "pill active" : "pill"}
            onClick={() => handleRadiusSelect(5, false)}
          >
            Within 5 km
          </button>
          <button
            type="button"
            className={radiusKm === 10 && !autoExpand ? "pill active" : "pill"}
            onClick={() => handleRadiusSelect(10, false)}
          >
            Within 10 km
          </button>
          <button
            type="button"
            className={radiusKm === 25 && !autoExpand ? "pill active" : "pill"}
            onClick={() => handleRadiusSelect(25, false)}
          >
            Within 25 km
          </button>
          <button
            type="button"
            className={radiusKm === "all" ? "pill active" : "pill"}
            onClick={() => handleRadiusSelect("all", false)}
          >
            All Verified
          </button>
        </div>

        <div className="inline-filter-input">
          <input
            placeholder="Filter by pharmacy name or area..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Progressive Radius Expansion Notice */}
      {radiusMeta?.wasExpanded && (
        <div className="radius-expansion-banner">
          <span>
            📡 No pharmacies were found within{" "}
            <strong>{radiusMeta.initialRadiusKm} km</strong> — MediFind
            automatically expanded the discovery radius to{" "}
            <strong>{radiusMeta.appliedRadiusKm} km</strong> and found{" "}
            <strong>{pharmacies.length}</strong> verified{" "}
            {pharmacies.length === 1 ? "pharmacy" : "pharmacies"}.
          </span>
        </div>
      )}

      {/* Interactive Map */}
      {showMap && (
        <InteractiveMap
          userLocation={customerLocation}
          pharmacies={pharmacies}
          radiusKm={
            radiusMeta?.appliedRadiusKm ||
            (radiusKm !== "all" ? Number(radiusKm) : null)
          }
          onSelectPharmacy={onSelectPharmacy}
        />
      )}

      {loading ? (
        <p className="admin-empty">Discovering nearby verified pharmacies...</p>
      ) : pharmacies.length === 0 ? (
        <div className="admin-empty">
          <p>
            No verified pharmacies found within{" "}
            {radiusMeta?.appliedRadiusKm
              ? `${radiusMeta.appliedRadiusKm} km`
              : "the selected area"}
            .
          </p>
          {radiusMeta?.hasMoreOutsideRadius && (
            <button
              type="button"
              className="primary-action"
              style={{ marginTop: "14px" }}
              onClick={() => handleRadiusSelect("all", false)}
            >
              Expand to Show All {radiusMeta.totalAvailableEverywhere} Verified
              Pharmacies
              {radiusMeta.nearestAvailableDistanceKm != null
                ? ` (Nearest is ${radiusMeta.nearestAvailableDistanceKm} km away)`
                : ""}
            </button>
          )}
        </div>
      ) : (
        <div className="results-grid">
          {pharmacies.map((pharm, idx) => (
            <article className="medicine-card pharmacy-discovery-card" key={pharm._id}>
              <div className="admin-card-header">
                <div>
                  <h3>{pharm.pharmacyName}</h3>
                  <div className="badge-row">
                    <span className="status-badge status-approved">
                      ✓ Verified
                    </span>
                    {pharm.isOpen != null && (
                      <span
                        className={`status-badge ${
                          pharm.isOpen ? "status-approved" : "status-rejected"
                        }`}
                      >
                        {pharm.isOpen ? "Open Now" : "Closed"}
                      </span>
                    )}
                  </div>
                </div>
                {pharm.profileImage ? (
                  <img
                    src={pharm.profileImage}
                    alt={pharm.pharmacyName}
                    className="admin-pharmacy-thumb"
                  />
                ) : (
                  <div className="admin-pharmacy-thumb thumb-placeholder">
                    🏥
                  </div>
                )}
              </div>

              {pharm.distance != null && (
                <p className="distance-info">
                  📍{" "}
                  {pharm.distance < 1
                    ? `${(pharm.distance * 1000).toFixed(0)} metres away`
                    : `${pharm.distance.toFixed(2)} km away`}
                  {idx === 0 && <strong> • Nearest</strong>}
                </p>
              )}

              <p>
                <strong>Address:</strong> {pharm.address}
              </p>
              <p>
                <strong>Phone:</strong> {pharm.phone || "Not provided"}
              </p>
              <p>
                <strong>Timings:</strong>{" "}
                {pharm.openingTime && pharm.closingTime
                  ? `${pharm.openingTime} – ${pharm.closingTime}`
                  : "Standard Hours"}
              </p>
              <p>
                <strong>In-Stock Medicines:</strong>{" "}
                <span className="stock-highlight">
                  {pharm.inStockMedicines || 0} available
                </span>
              </p>
              <p>
                <strong>Fulfillment:</strong>{" "}
                {pharm.deliveryAvailable !== false
                  ? `Home Delivery (₹${pharm.deliveryFee ?? 30}) & Pickup`
                  : "Pharmacy Pickup Only"}
              </p>

              <div className="card-actions pharmacy-card-actions">
                <button
                  type="button"
                  onClick={() => onSelectPharmacy(pharm._id)}
                >
                  📦 View Full Inventory
                </button>

                {pharm.phone && (
                  <a className="call-link-btn" href={`tel:${pharm.phone}`}>
                    📞 Call Pharmacy
                  </a>
                )}

                {pharm.latitude != null && pharm.longitude != null && (
                  <a
                    className="directions-link"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${pharm.latitude},${pharm.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Directions ↗
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default NearbyPharmacies;
