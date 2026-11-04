import { useEffect, useState, useCallback } from "react";

function PharmacyOwnerPortal({
  activeTab,
  apiRequest,
  notify
}) {
  const [orders, setOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState("all");
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [viewingPrescription, setViewingPrescription] = useState(null);
  const [prescriptionNotes, setPrescriptionNotes] = useState("");

  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const data = await apiRequest("/api/orders/pharmacy-orders");
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error.message || "Could not load pharmacy orders.");
    } finally {
      setLoadingOrders(false);
    }
  }, [apiRequest, notify]);

  const loadAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const data = await apiRequest("/api/pharmacy/analytics");
      setAnalytics(data);
    } catch (error) {
      notify(error.message || "Could not load sales and inventory reports.");
    } finally {
      setLoadingAnalytics(false);
    }
  }, [apiRequest, notify]);

  useEffect(() => {
    if (activeTab === "orders") {
      loadOrders();
    } else if (activeTab === "reports") {
      loadAnalytics();
    }
  }, [activeTab, loadAnalytics, loadOrders]);

  async function updateOrderStatus(orderId, status) {
    let note = "";
    if (status === "rejected") {
      const reason = window.prompt(
        "Reason for rejecting this order:",
        "Requested stock unavailable"
      );
      if (reason === null) return;
      note = reason;
    }

    try {
      const data = await apiRequest(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, note })
      });
      notify(data.message);
      loadOrders();
    } catch (error) {
      notify(error.message || "Unable to update order status.");
    }
  }

  async function openPrescriptionViewer(orderId) {
    try {
      const rx = await apiRequest(`/api/orders/${orderId}/prescription`);
      setViewingPrescription({ orderId, ...rx });
      setPrescriptionNotes(rx.verificationNotes || "");
    } catch (error) {
      notify(error.message || "Unable to load prescription.");
    }
  }

  async function handleVerifyPrescription(status) {
    if (!viewingPrescription) return;
    try {
      const data = await apiRequest(
        `/api/orders/${viewingPrescription.orderId}/verify-prescription`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            notes: prescriptionNotes
          })
        }
      );
      notify(data.message);
      setViewingPrescription(null);
      loadOrders();
    } catch (error) {
      notify(error.message || "Could not update prescription status.");
    }
  }

  if (activeTab === "reports") {
    return (
      <section className="dashboard">
        <h2>📊 Sales & Inventory Reports</h2>

        {loadingAnalytics || !analytics ? (
          <p className="admin-empty">Loading analytics report...</p>
        ) : (
          <>
            <div className="stats-grid admin-stats-grid">
              <article className="stat-card">
                <h3>₹{analytics.salesSummary.totalRevenue.toFixed(2)}</h3>
                <p>Verified Sales Revenue</p>
              </article>
              <article className="stat-card">
                <h3>{analytics.salesSummary.totalOrders}</h3>
                <p>Total Orders Received</p>
              </article>
              <article className="stat-card">
                <h3>{analytics.salesSummary.completedOrders}</h3>
                <p>Completed Orders</p>
              </article>
              <article className="stat-card">
                <h3>{analytics.inventorySummary.inStockCount}</h3>
                <p>In-Stock Medicines</p>
              </article>
              <article className="stat-card">
                <h3>{analytics.inventorySummary.outOfStockCount}</h3>
                <p>Out-of-Stock Medicines</p>
              </article>
            </div>

            <div className="checkout-grid">
              <div className="medicine-card">
                <h3>🏆 Top Selling Medicines</h3>
                {analytics.salesSummary.topSellingMedicines.length === 0 ? (
                  <p>No completed medicine sales yet.</p>
                ) : (
                  <div className="order-items-mini">
                    {analytics.salesSummary.topSellingMedicines.map(item => (
                      <div key={item.name} className="order-item-line">
                        <span>
                          <strong>{item.name}</strong> ({item.unitsSold} units
                          sold)
                        </span>
                        <strong>₹{item.revenue.toFixed(2)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="medicine-card">
                <h3>
                  ⚠️ Low Stock Alerts ({analytics.inventorySummary.lowStockCount})
                </h3>
                {analytics.inventorySummary.lowStockItems.length === 0 ? (
                  <p>All stocked medicines have healthy quantities (&gt; 10).</p>
                ) : (
                  <div className="order-items-mini">
                    {analytics.inventorySummary.lowStockItems.map(med => (
                      <div key={med._id} className="order-item-line">
                        <span>{med.name}</span>
                        <strong style={{ color: "#dc2626" }}>
                          Only {med.quantity} left
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    );
  }

  const filteredOrders = orders.filter(o => {
    if (orderFilter === "all") return true;
    if (orderFilter === "active") {
      return [
        "placed",
        "accepted",
        "preparing",
        "ready_for_pickup",
        "out_for_delivery"
      ].includes(o.orderStatus);
    }
    if (orderFilter === "completed") return o.orderStatus === "completed";
    if (orderFilter === "cancelled") {
      return ["cancelled", "rejected"].includes(o.orderStatus);
    }
    return true;
  });

  return (
    <section className="dashboard">
      <div className="section-header-flex">
        <h2>📋 Incoming Customer Orders ({orders.length})</h2>
        <button type="button" className="pill" onClick={loadOrders}>
          ↻ Refresh Orders
        </button>
      </div>

      <div className="admin-filter-bar">
        <div className="filter-pills">
          <button
            type="button"
            className={orderFilter === "all" ? "pill active" : "pill"}
            onClick={() => setOrderFilter("all")}
          >
            All Orders ({orders.length})
          </button>
          <button
            type="button"
            className={orderFilter === "active" ? "pill active" : "pill"}
            onClick={() => setOrderFilter("active")}
          >
            Active Fulfillment
          </button>
          <button
            type="button"
            className={orderFilter === "completed" ? "pill active" : "pill"}
            onClick={() => setOrderFilter("completed")}
          >
            Completed
          </button>
          <button
            type="button"
            className={orderFilter === "cancelled" ? "pill active" : "pill"}
            onClick={() => setOrderFilter("cancelled")}
          >
            Cancelled / Rejected
          </button>
        </div>
      </div>

      {loadingOrders ? (
        <p className="admin-empty">Loading incoming orders...</p>
      ) : filteredOrders.length === 0 ? (
        <p className="admin-empty">No orders in this category.</p>
      ) : (
        <div className="orders-stack">
          {filteredOrders.map(order => (
            <article className="medicine-card order-tracking-card" key={order._id}>
              <div className="admin-card-header">
                <div>
                  <h3>
                    Order #{order.orderNumber} •{" "}
                    <span>
                      {order.fulfillmentType === "delivery"
                        ? "🚚 Home Delivery"
                        : "🏪 Pharmacy Pickup"}
                    </span>
                  </h3>
                  <p>
                    <strong>Customer:</strong> {order.customer?.name || "Customer"}{" "}
                    • 📞{" "}
                    <a href={`tel:${order.customerPhone}`}>
                      {order.customerPhone}
                    </a>
                  </p>
                  {order.fulfillmentType === "delivery" && (
                    <p>
                      <strong>Delivery Address:</strong>{" "}
                      {order.deliveryAddress?.street},{" "}
                      {order.deliveryAddress?.city} -{" "}
                      {order.deliveryAddress?.pincode}
                    </p>
                  )}
                </div>

                <div className="badge-row">
                  <span
                    className={`status-badge ${
                      order.paymentStatus === "paid"
                        ? "status-approved"
                        : "status-pending"
                    }`}
                  >
                    Payment: {order.paymentStatus.toUpperCase()}
                  </span>
                  <span className="status-badge status-approved">
                    {order.orderStatus.replace(/_/g, " ").toUpperCase()}
                  </span>
                </div>
              </div>

              {order.requiresPrescription && (
                <div className="rx-verification-bar">
                  <span>
                    🩺 <strong>Prescription Status:</strong>{" "}
                    <strong className="rx-status-text">
                      {order.prescriptionStatus.toUpperCase()}
                    </strong>
                  </span>
                  <button
                    type="button"
                    className="pill active"
                    onClick={() => openPrescriptionViewer(order._id)}
                  >
                    🔍 Inspect & Verify Prescription
                  </button>
                </div>
              )}

              <div className="order-items-mini">
                {order.items.map((item, idx) => (
                  <div key={idx} className="order-item-line">
                    <span>
                      {item.name} {item.strength ? `(${item.strength})` : ""} ×{" "}
                      {item.quantity}
                    </span>
                    <strong>₹{item.subtotal.toFixed(2)}</strong>
                  </div>
                ))}
              </div>

              <div className="order-footer-meta">
                <h4>Order Total: ₹{order.totalAmount.toFixed(2)}</h4>

                <div className="card-actions admin-actions">
                  {order.orderStatus === "placed" && (
                    <>
                      <button
                        type="button"
                        className="approve-btn"
                        onClick={() => updateOrderStatus(order._id, "accepted")}
                      >
                        ✓ Accept Order
                      </button>
                      <button
                        type="button"
                        className="delete-btn"
                        onClick={() => updateOrderStatus(order._id, "rejected")}
                      >
                        ✕ Reject Order
                      </button>
                    </>
                  )}

                  {order.orderStatus === "accepted" && (
                    <button
                      type="button"
                      onClick={() => updateOrderStatus(order._id, "preparing")}
                    >
                      ⚙️ Start Preparing
                    </button>
                  )}

                  {order.orderStatus === "preparing" &&
                    order.fulfillmentType === "pickup" && (
                      <button
                        type="button"
                        className="approve-btn"
                        onClick={() =>
                          updateOrderStatus(order._id, "ready_for_pickup")
                        }
                      >
                        🏪 Mark Ready for Pickup
                      </button>
                    )}

                  {order.orderStatus === "preparing" &&
                    order.fulfillmentType === "delivery" && (
                      <button
                        type="button"
                        className="approve-btn"
                        onClick={() =>
                          updateOrderStatus(order._id, "out_for_delivery")
                        }
                      >
                        🚚 Dispatch for Delivery
                      </button>
                    )}

                  {["ready_for_pickup", "out_for_delivery"].includes(
                    order.orderStatus
                  ) && (
                    <button
                      type="button"
                      className="approve-btn"
                      onClick={() => updateOrderStatus(order._id, "completed")}
                    >
                      ✅ Complete Order
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* PRESCRIPTION MODAL FOR PHARMACIST VERIFICATION */}
      {viewingPrescription && (
        <div
          className="modal-backdrop"
          onClick={() => setViewingPrescription(null)}
        >
          <div
            className="modal-card prescription-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>🩺 Pharmacist Prescription Verification</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setViewingPrescription(null)}
              >
                ✕
              </button>
            </div>

            <p>
              <strong>Patient Name:</strong> {viewingPrescription.patientName}
            </p>
            {viewingPrescription.doctorName && (
              <p>
                <strong>Doctor Name:</strong> {viewingPrescription.doctorName}
              </p>
            )}

            <div className="prescription-preview-box">
              {viewingPrescription.fileData?.startsWith("data:image/") ? (
                <img
                  src={viewingPrescription.fileData}
                  alt="Uploaded Prescription"
                  className="rx-preview-img"
                />
              ) : (
                <a
                  href={viewingPrescription.fileData}
                  download="prescription.pdf"
                  className="primary-action"
                >
                  📄 Download / View Uploaded PDF Prescription
                </a>
              )}
            </div>

            <label>Pharmacist Verification Note</label>
            <input
              placeholder="Enter verification note or rejection reason..."
              value={prescriptionNotes}
              onChange={e => setPrescriptionNotes(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                margin: "10px 0 16px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1"
              }}
            />

            <div className="profile-form-actions">
              <button
                type="button"
                className="approve-btn"
                onClick={() => handleVerifyPrescription("verified")}
              >
                ✓ Approve & Verify Prescription
              </button>
              <button
                type="button"
                className="delete-btn"
                onClick={() => handleVerifyPrescription("rejected")}
              >
                ✕ Reject Prescription
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default PharmacyOwnerPortal;
