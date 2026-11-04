import { useEffect, useState, useCallback } from "react";
import InteractiveMap from "./InteractiveMap";

function PharmacyDetail({
  pharmacyId,
  apiRequest,
  notify,
  customerLocation,
  cart,
  onAddToCart,
  onBack
}) {
  const [pharmacy, setPharmacy] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [inStockOnly, setInStockOnly] = useState(false);

  const loadStorefront = useCallback(async () => {
    if (!pharmacyId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (customerLocation?.latitude != null && customerLocation?.longitude != null) {
        params.set("lat", customerLocation.latitude);
        params.set("lng", customerLocation.longitude);
      }
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }
      if (categoryFilter !== "all") {
        params.set("category", categoryFilter);
      }
      if (inStockOnly) {
        params.set("inStockOnly", "true");
      }

      const data = await apiRequest(
        `/api/pharmacy/${pharmacyId}/public?${params.toString()}`
      );
      setPharmacy(data.pharmacy);
      setMedicines(Array.isArray(data.medicines) ? data.medicines : []);
    } catch (error) {
      notify(error.message || "Unable to load pharmacy storefront.");
    } finally {
      setLoading(false);
    }
  }, [
    apiRequest,
    categoryFilter,
    customerLocation,
    inStockOnly,
    notify,
    pharmacyId,
    searchQuery
  ]);

  useEffect(() => {
    loadStorefront();
  }, [loadStorefront]);

  const categories = [
    "all",
    ...Array.from(
      new Set(medicines.map(m => m.category || "General").filter(Boolean))
    )
  ];

  function getCartQuantity(medId) {
    const found = cart.items.find(i => i.medicineId === medId);
    return found ? found.quantity : 0;
  }

  return (
    <section className="dashboard pharmacy-detail-page">
      <div className="back-nav-row">
        <button type="button" className="back-btn" onClick={onBack}>
          ← Back to Discovery
        </button>
      </div>

      {loading && !pharmacy ? (
        <p className="admin-empty">Loading pharmacy storefront...</p>
      ) : !pharmacy ? (
        <p className="admin-empty">Pharmacy not found.</p>
      ) : (
        <>
          <div className="pharmacy-hero-card">
            <div className="pharmacy-hero-main">
              {pharmacy.profileImage ? (
                <img
                  src={pharmacy.profileImage}
                  alt={pharmacy.pharmacyName}
                  className="pharmacy-avatar"
                />
              ) : (
                <div className="pharmacy-avatar avatar-placeholder">🏥</div>
              )}

              <div className="pharmacy-hero-info">
                <div className="badge-row">
                  <span className="status-badge status-approved">
                    ✓ Verified Pharmacy
                  </span>
                  {pharmacy.isOpen != null && (
                    <span
                      className={`status-badge ${
                        pharmacy.isOpen ? "status-approved" : "status-rejected"
                      }`}
                    >
                      {pharmacy.isOpen ? "Open Now" : "Currently Closed"}
                    </span>
                  )}
                  {pharmacy.licenseNumber && (
                    <span className="role-chip">
                      Lic: {pharmacy.licenseNumber}
                    </span>
                  )}
                </div>

                <h2>{pharmacy.pharmacyName}</h2>
                <p>📍 {pharmacy.address}</p>
                {pharmacy.distance != null && (
                  <p className="distance-info">
                    🚗{" "}
                    {pharmacy.distance < 1
                      ? `${(pharmacy.distance * 1000).toFixed(0)} metres from your location`
                      : `${pharmacy.distance.toFixed(2)} km from your location`}
                  </p>
                )}
                <p>
                  🕒 Operating Hours:{" "}
                  {pharmacy.openingTime && pharmacy.closingTime
                    ? `${pharmacy.openingTime} – ${pharmacy.closingTime}`
                    : "Standard Hours"}
                </p>
                <p>
                  🚚 Fulfillment:{" "}
                  {pharmacy.deliveryAvailable !== false
                    ? `Home Delivery (₹${pharmacy.deliveryFee ?? 30}) & Pharmacy Pickup`
                    : "Pharmacy Pickup Only"}
                </p>

                <div className="pharmacy-hero-actions">
                  {pharmacy.phone && (
                    <a className="call-link-btn" href={`tel:${pharmacy.phone}`}>
                      📞 Call Pharmacy ({pharmacy.phone})
                    </a>
                  )}
                  {pharmacy.latitude != null && pharmacy.longitude != null && (
                    <a
                      className="directions-link"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${pharmacy.latitude},${pharmacy.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Get Directions on Google Maps ↗
                    </a>
                  )}
                </div>
              </div>
            </div>

            {pharmacy.latitude != null && pharmacy.longitude != null && (
              <div className="pharmacy-mini-map">
                <InteractiveMap
                  userLocation={customerLocation}
                  pharmacies={[pharmacy]}
                  height="220px"
                />
              </div>
            )}
          </div>

          {/* Storefront Inventory Filter Bar */}
          <div className="admin-filter-bar store-inventory-filter">
            <div className="admin-search-form">
              <input
                placeholder={`Search medicines inside ${pharmacy.pharmacyName}...`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-pills">
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  className={categoryFilter === cat ? "pill active" : "pill"}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat === "all" ? "All Categories" : cat}
                </button>
              ))}
            </div>

            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={e => setInStockOnly(e.target.checked)}
              />
              In-Stock Only
            </label>
          </div>

          <h3>
            Complete Medicine Inventory ({medicines.length}{" "}
            {medicines.length === 1 ? "item" : "items"})
          </h3>

          {medicines.length === 0 ? (
            <p className="admin-empty">
              No medicines match your search in this pharmacy.
            </p>
          ) : (
            <div className="results-grid">
              {medicines.map(med => {
                const inStock = med.available && med.quantity > 0;
                const qtyInCart = getCartQuantity(med._id);
                return (
                  <article className="medicine-card" key={med._id}>
                    <div className="admin-card-header">
                      <div>
                        <h3>{med.name}</h3>
                        <p className="med-meta-line">
                          {[med.strength, med.formulation, med.category]
                            .filter(Boolean)
                            .join(" • ")}
                        </p>
                      </div>
                      <span
                        className={`status-badge ${
                          inStock ? "status-approved" : "status-rejected"
                        }`}
                      >
                        {inStock ? `In Stock (${med.quantity})` : "Out of Stock"}
                      </span>
                    </div>

                    {med.manufacturer && (
                      <p>
                        <strong>Manufacturer:</strong> {med.manufacturer}
                      </p>
                    )}

                    {med.description && <p>{med.description}</p>}

                    {med.requiresPrescription && (
                      <p className="rx-badge">
                        🩺 Prescription Required (Upload at Checkout)
                      </p>
                    )}

                    <p className="price-tag-line">
                      <strong>Price:</strong>{" "}
                      {med.price == null ? (
                        "Call for price"
                      ) : (
                        <span className="price-highlight">₹{med.price}</span>
                      )}
                    </p>

                    <div className="card-actions">
                      {inStock && med.price != null ? (
                        <button
                          type="button"
                          onClick={() => onAddToCart(med, pharmacy)}
                        >
                          🛒 Add to Cart{" "}
                          {qtyInCart > 0 ? `(${qtyInCart} in cart)` : ""}
                        </button>
                      ) : (
                        <button type="button" disabled>
                          {inStock
                            ? "Call Pharmacy to Order"
                            : "Currently Unavailable"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default PharmacyDetail;
