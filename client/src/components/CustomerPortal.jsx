import { useEffect, useState, useCallback } from "react";

const ORDER_STEPS_DELIVERY = [
  "placed",
  "accepted",
  "preparing",
  "out_for_delivery",
  "completed"
];

const ORDER_STEPS_PICKUP = [
  "placed",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "completed"
];

function CustomerPortal({
  activeView = "orders",
  user,
  apiRequest,
  notify,
  onUpdateUser
}) {
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    address: user?.address || ""
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [addresses, setAddresses] = useState([]);
  const [newAddress, setNewAddress] = useState({
    label: "Home",
    recipientName: user?.name || "",
    phone: user?.phone || "",
    street: "",
    city: "Hyderabad",
    pincode: "",
    landmark: "",
    isDefault: true
  });

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const data = await apiRequest("/api/orders/my-orders");
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error.message || "Could not load orders.");
    } finally {
      setLoadingOrders(false);
    }
  }, [apiRequest, notify]);

  const loadAddresses = useCallback(async () => {
    try {
      const data = await apiRequest("/api/auth/addresses");
      setAddresses(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, [apiRequest]);

  useEffect(() => {
    if (activeView === "orders") {
      loadOrders();
    } else if (activeView === "profile") {
      loadAddresses();
    }
  }, [activeView, loadAddresses, loadOrders]);

  async function handleCancelOrder(orderId) {
    const reason = window.prompt(
      "Optional reason for cancelling this order:",
      "Ordered by mistake"
    );
    if (reason === null) return;

    try {
      const data = await apiRequest(`/api/orders/${orderId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason })
      });
      notify(data.message || "Order cancelled.");
      loadOrders();
    } catch (error) {
      notify(error.message || "Could not cancel order.");
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const data = await apiRequest("/api/auth/me", {
        method: "PUT",
        body: JSON.stringify(profileForm)
      });
      onUpdateUser(data.user);
      notify(data.message || "Profile updated!");
    } catch (error) {
      notify(error.message || "Unable to update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAddAddress(e) {
    e.preventDefault();
    try {
      const data = await apiRequest("/api/auth/addresses", {
        method: "POST",
        body: JSON.stringify(newAddress)
      });
      notify(data.message || "Address saved!");
      setNewAddress({
        label: "Home",
        recipientName: user?.name || "",
        phone: user?.phone || "",
        street: "",
        city: "Hyderabad",
        pincode: "",
        landmark: "",
        isDefault: false
      });
      loadAddresses();
    } catch (error) {
      notify(error.message || "Unable to save address.");
    }
  }

  async function handleDeleteAddress(id) {
    try {
      await apiRequest(`/api/auth/addresses/${id}`, { method: "DELETE" });
      notify("Address deleted.");
      loadAddresses();
    } catch (error) {
      notify(error.message || "Unable to delete address.");
    }
  }

  if (activeView === "profile") {
    return (
      <section className="dashboard">
        <h2>👤 Customer Profile & Saved Addresses</h2>

        <div className="checkout-grid">
          <form className="medicine-form" onSubmit={handleSaveProfile}>
            <h3>Personal Details</h3>
            <label>Full Name</label>
            <input
              required
              value={profileForm.name}
              onChange={e =>
                setProfileForm({ ...profileForm, name: e.target.value })
              }
            />
            <label>Email Address</label>
            <input value={user?.email || ""} disabled />

            <label>Phone Number</label>
            <input
              value={profileForm.phone}
              placeholder="Phone number"
              onChange={e =>
                setProfileForm({ ...profileForm, phone: e.target.value })
              }
            />

            <label>Primary Address Note</label>
            <input
              value={profileForm.address}
              placeholder="Default address"
              onChange={e =>
                setProfileForm({ ...profileForm, address: e.target.value })
              }
            />

            <button type="submit" disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save Profile"}
            </button>
          </form>

          <div className="checkout-cart-column">
            <form className="medicine-form" onSubmit={handleAddAddress}>
              <h3>Add Delivery Address</h3>
              <div className="coordinate-row">
                <select
                  value={newAddress.label}
                  onChange={e =>
                    setNewAddress({ ...newAddress, label: e.target.value })
                  }
                >
                  <option value="Home">Home</option>
                  <option value="Work">Work</option>
                  <option value="Other">Other</option>
                </select>
                <input
                  required
                  placeholder="Recipient Name"
                  value={newAddress.recipientName}
                  onChange={e =>
                    setNewAddress({
                      ...newAddress,
                      recipientName: e.target.value
                    })
                  }
                />
              </div>

              <input
                required
                placeholder="Phone Number"
                value={newAddress.phone}
                onChange={e =>
                  setNewAddress({ ...newAddress, phone: e.target.value })
                }
              />

              <input
                required
                placeholder="House No, Building, Street *"
                value={newAddress.street}
                onChange={e =>
                  setNewAddress({ ...newAddress, street: e.target.value })
                }
              />

              <div className="coordinate-row">
                <input
                  required
                  placeholder="City *"
                  value={newAddress.city}
                  onChange={e =>
                    setNewAddress({ ...newAddress, city: e.target.value })
                  }
                />
                <input
                  required
                  placeholder="Pincode *"
                  value={newAddress.pincode}
                  onChange={e =>
                    setNewAddress({ ...newAddress, pincode: e.target.value })
                  }
                />
              </div>

              <button type="submit">Save Delivery Address</button>
            </form>

            {addresses.length > 0 && (
              <div style={{ marginTop: "20px" }}>
                <h3>Saved Addresses ({addresses.length})</h3>
                <div className="results-grid">
                  {addresses.map(addr => (
                    <article className="medicine-card" key={addr._id}>
                      <h3>
                        {addr.label}{" "}
                        {addr.isDefault && (
                          <span className="status-badge status-approved">
                            Default
                          </span>
                        )}
                      </h3>
                      <p>
                        <strong>{addr.recipientName}</strong> ({addr.phone})
                      </p>
                      <p>
                        {addr.street}, {addr.city} - {addr.pincode}
                      </p>
                      <div className="card-actions">
                        <button
                          type="button"
                          className="delete-btn"
                          onClick={() => handleDeleteAddress(addr._id)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard">
      <div className="section-header-flex">
        <h2>📦 My Orders & Live Status Tracking</h2>
        <button type="button" className="pill" onClick={loadOrders}>
          ↻ Refresh Status
        </button>
      </div>

      {loadingOrders ? (
        <p className="admin-empty">Loading your orders...</p>
      ) : orders.length === 0 ? (
        <p className="admin-empty">You haven&apos;t placed any orders yet.</p>
      ) : (
        <div className="orders-stack">
          {orders.map(order => {
            const steps =
              order.fulfillmentType === "delivery"
                ? ORDER_STEPS_DELIVERY
                : ORDER_STEPS_PICKUP;
            const currentStepIdx = steps.indexOf(order.orderStatus);

            return (
              <article className="medicine-card order-tracking-card" key={order._id}>
                <div className="admin-card-header">
                  <div>
                    <h3>
                      Order #{order.orderNumber} •{" "}
                      <span>{order.pharmacy?.pharmacyName}</span>
                    </h3>
                    <p className="updated">
                      Placed on{" "}
                      {new Date(order.createdAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      })}
                    </p>
                  </div>

                  <div className="badge-row">
                    <span
                      className={`status-badge ${
                        order.paymentStatus === "paid"
                          ? "status-approved"
                          : order.paymentStatus === "refunded"
                            ? "status-pending"
                            : "status-rejected"
                      }`}
                    >
                      Payment: {order.paymentStatus.toUpperCase()}
                    </span>

                    <span
                      className={`status-badge ${
                        order.orderStatus === "completed"
                          ? "status-approved"
                          : ["cancelled", "rejected"].includes(
                                order.orderStatus
                              )
                            ? "status-rejected"
                            : "status-pending"
                      }`}
                    >
                      {order.orderStatus.replace(/_/g, " ").toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Progress Stepper */}
                {!["cancelled", "rejected"].includes(order.orderStatus) && (
                  <div className="order-stepper">
                    {steps.map((step, idx) => (
                      <div
                        key={step}
                        className={`step-node ${
                          idx <= currentStepIdx ? "done" : ""
                        }`}
                      >
                        <div className="step-dot">{idx + 1}</div>
                        <span>{step.replace(/_/g, " ")}</span>
                      </div>
                    ))}
                  </div>
                )}

                {["cancelled", "rejected"].includes(order.orderStatus) &&
                  order.rejectionOrCancelReason && (
                    <p className="rejection-note">
                      <strong>Reason:</strong> {order.rejectionOrCancelReason}
                    </p>
                  )}

                {order.requiresPrescription && (
                  <p>
                    <strong>🩺 Prescription Verification:</strong>{" "}
                    <span
                      className={`status-badge status-${
                        order.prescriptionStatus === "verified"
                          ? "approved"
                          : order.prescriptionStatus === "rejected"
                            ? "rejected"
                            : "pending"
                      }`}
                    >
                      {order.prescriptionStatus}
                    </span>
                  </p>
                )}

                <div className="order-items-mini">
                  {order.items.map((item, i) => (
                    <div key={i} className="order-item-line">
                      <span>
                        {item.name}{" "}
                        {item.strength ? `(${item.strength})` : ""} ×{" "}
                        {item.quantity}
                      </span>
                      <strong>₹{item.subtotal.toFixed(2)}</strong>
                    </div>
                  ))}
                </div>

                <div className="order-footer-meta">
                  <div>
                    <p>
                      <strong>Fulfillment:</strong>{" "}
                      {order.fulfillmentType === "delivery"
                        ? `🚚 Home Delivery to ${order.deliveryAddress?.street}, ${order.deliveryAddress?.city}`
                        : `🏪 Pickup at ${order.pharmacy?.address}`}
                    </p>
                    {order.payment?.gatewayPaymentId && (
                      <p className="updated">
                        Txn ID: {order.payment.gatewayPaymentId}
                      </p>
                    )}
                  </div>

                  <div className="order-total-actions">
                    <h4>Total: ₹{order.totalAmount.toFixed(2)}</h4>
                    <div className="card-actions">
                      {order.pharmacy?.phone && (
                        <a
                          className="call-link-btn"
                          href={`tel:${order.pharmacy.phone}`}
                        >
                          📞 Call Pharmacy
                        </a>
                      )}
                      {["placed", "accepted", "preparing"].includes(
                        order.orderStatus
                      ) && (
                        <button
                          type="button"
                          className="delete-btn"
                          onClick={() => handleCancelOrder(order._id)}
                        >
                          Cancel Order
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default CustomerPortal;
