import { useEffect, useRef } from "react";

/**
 * Interactive Map component powered by Leaflet + OpenStreetMap tiles
 * with automatic fallback coordinate visualizer if offline.
 */
function InteractiveMap({
  userLocation,
  pharmacies = [],
  radiusKm = null,
  onSelectPharmacy,
  onPickCoordinates,
  height = "360px"
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);

  const validPharmacies = pharmacies.filter(
    p =>
      p &&
      p.latitude != null &&
      p.longitude != null &&
      Number.isFinite(Number(p.latitude)) &&
      Number.isFinite(Number(p.longitude))
  );

  const centerLat =
    userLocation?.latitude != null
      ? Number(userLocation.latitude)
      : validPharmacies[0]
        ? Number(validPharmacies[0].latitude)
        : 17.385;
  const centerLng =
    userLocation?.longitude != null
      ? Number(userLocation.longitude)
      : validPharmacies[0]
        ? Number(validPharmacies[0].longitude)
        : 78.4867;

  useEffect(() => {
    const L = window.L;
    if (!L || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current).setView(
        [centerLat, centerLng],
        13
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      if (onPickCoordinates) {
        map.on("click", e => {
          onPickCoordinates({
            latitude: Number(e.latlng.lat.toFixed(6)),
            longitude: Number(e.latlng.lng.toFixed(6))
          });
        });
      }
    }

    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    layer.clearLayers();

    const bounds = [];

    if (
      userLocation?.latitude != null &&
      userLocation?.longitude != null &&
      Number.isFinite(Number(userLocation.latitude)) &&
      Number.isFinite(Number(userLocation.longitude))
    ) {
      const uLat = Number(userLocation.latitude);
      const uLng = Number(userLocation.longitude);
      bounds.push([uLat, uLng]);

      const userMarker = L.circleMarker([uLat, uLng], {
        radius: 9,
        fillColor: "#2563eb",
        color: "#ffffff",
        weight: 3,
        opacity: 1,
        fillOpacity: 0.95
      }).bindPopup(
        `<strong>📍 Your Selected Location</strong><br/>${
          userLocation.label || `${uLat.toFixed(4)}, ${uLng.toFixed(4)}`
        }`
      );
      layer.addLayer(userMarker);

      if (radiusKm && Number.isFinite(Number(radiusKm))) {
        const circle = L.circle([uLat, uLng], {
          radius: Number(radiusKm) * 1000,
          color: "#087e65",
          fillColor: "#10b981",
          fillOpacity: 0.08,
          weight: 1.5,
          dashArray: "6 4"
        });
        layer.addLayer(circle);
      }
    }

    validPharmacies.forEach(pharm => {
      const pLat = Number(pharm.latitude);
      const pLng = Number(pharm.longitude);
      bounds.push([pLat, pLng]);

      const marker = L.circleMarker([pLat, pLng], {
        radius: 10,
        fillColor: "#087e65",
        color: "#ffffff",
        weight: 3,
        opacity: 1,
        fillOpacity: 0.95
      });

      const distLabel =
        pharm.distance != null
          ? pharm.distance < 1
            ? `${(pharm.distance * 1000).toFixed(0)} m away`
            : `${pharm.distance.toFixed(2)} km away`
          : "";

      const popupDiv = document.createElement("div");
      popupDiv.className = "map-popup-card";
      popupDiv.innerHTML = `
        <strong>🏥 ${pharm.pharmacyName || "Pharmacy"}</strong>
        ${distLabel ? `<div style="color:#087e65;font-weight:600;margin:3px 0;">📍 ${distLabel}</div>` : ""}
        <div style="font-size:12px;color:#475569;margin-bottom:6px;">${pharm.address || ""}</div>
        ${
          pharm.phone
            ? `<a href="tel:${pharm.phone}" style="display:inline-block;margin-right:8px;color:#087e65;font-weight:700;font-size:12px;">📞 Call</a>`
            : ""
        }
        <a href="https://www.google.com/maps/dir/?api=1&destination=${pLat},${pLng}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;font-weight:700;font-size:12px;">Directions ↗</a>
      `;

      if (onSelectPharmacy && pharm._id) {
        const viewBtn = document.createElement("button");
        viewBtn.textContent = "View Store Inventory →";
        viewBtn.style.cssText =
          "display:block;width:100%;margin-top:8px;padding:6px 10px;background:#087e65;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;";
        viewBtn.onclick = () => onSelectPharmacy(pharm._id);
        popupDiv.appendChild(viewBtn);
      }

      marker.bindPopup(popupDiv);
      layer.addLayer(marker);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    }
  }, [
    centerLat,
    centerLng,
    onPickCoordinates,
    onSelectPharmacy,
    radiusKm,
    userLocation,
    validPharmacies
  ]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="interactive-map-wrapper">
      <div
        ref={mapContainerRef}
        className="leaflet-map-canvas"
        style={{ height }}
      />
      <div className="map-legend-bar">
        <span>
          <i className="legend-dot user-dot" /> Your Location
        </span>
        <span>
          <i className="legend-dot pharm-dot" /> Verified Pharmacies (
          {validPharmacies.length})
        </span>
        {radiusKm && (
          <span>
            ⭕ Active Search Radius: <strong>{radiusKm} km</strong>
          </span>
        )}
        {onPickCoordinates && (
          <span>💡 Tip: Click anywhere on the map to set exact coordinates</span>
        )}
      </div>
    </div>
  );
}

export default InteractiveMap;
