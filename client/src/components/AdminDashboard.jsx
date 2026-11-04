import { useEffect, useState, useCallback } from "react";

function AdminDashboard({ apiRequest, notify }) {
  const [adminTab, setAdminTab] = useState("pharmacies");
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCustomers: 0,
    totalPharmacies: 0,
    pendingPharmacies: 0,
    approvedPharmacies: 0,
    rejectedPharmacies: 0,
    suspendedPharmacies: 0,
    totalMedicines: 0,
    totalOrders: 0,
    completedOrders: 0,
    totalRevenue: 0,
    totalPrescriptions: 0
  });

  const [pharmacies, setPharmacies] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [pharmacySearch, setPharmacySearch] = useState("");
  const [loadingPharmacies, setLoadingPharmacies] = useState(true);

  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [medicines, setMedicines] = useState([]);
  const [medSearch, setMedSearch] = useState("");
  const [loadingMeds, setLoadingMeds] = useState(false);

  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const data = await apiRequest("/api/admin/stats");
      setStats(data);
    } catch (error) {
      notify(error.message || "Could not load platform statistics.");
    }
  }, [apiRequest, notify]);

  const loadPharmacies = useCallback(
    async (currentStatus = statusFilter, currentSearch = pharmacySearch) => {
      setLoadingPharmacies(true);
      try {
        const params = new URLSearchParams();
        if (currentStatus && currentStatus !== "all") {
          params.set("status", currentStatus);
        }
        if (currentSearch.trim()) {
          params.set("search", currentSearch.trim());
        }
        const query = params.toString() ? `?${params.toString()}` : "";
        const data = await apiRequest(`/api/admin/pharmacies${query}`);
        setPharmacies(Array.isArray(data) ? data : []);
      } catch (error) {
        notify(error.message || "Could not load pharmacies.");
      } finally {
        setLoadingPharmacies(false);
      }
    },
    [apiRequest, notify, statusFilter, pharmacySearch]
  );

  const loadUsers = useCallback(
    async (currentRole = roleFilter, currentSearch = userSearch) => {
      setLoadingUsers(true);
      try {
        const params = new URLSearchParams();
        if (currentRole && currentRole !== "all") {
          params.set("role", currentRole);
        }
        if (currentSearch.trim()) {
          params.set("search", currentSearch.trim());
        }
        const query = params.toString() ? `?${params.toString()}` : "";
        const data = await apiRequest(`/api/admin/users${query}`);
        setUsers(Array.isArray(data) ? data : []);
      } catch (error) {
        notify(error.message || "Could not load users.");
      } finally {
        setLoadingUsers(false);
      }
    },
    [apiRequest, notify, roleFilter, userSearch]
  );

  const loadCatalogMedicines = useCallback(
    async (searchVal = medSearch) => {
      setLoadingMeds(true);
      try {
        const q = searchVal.trim()
          ? `?search=${encodeURIComponent(searchVal.trim())}`
          : "";
        const data = await apiRequest(`/api/admin/medicines${q}`);
        setMedicines(Array.isArray(data) ? data : []);
      } catch (error) {
        notify(error.message || "Could not load medicine catalog.");
      } finally {
        setLoadingMeds(false);
      }
    },
    [apiRequest, medSearch, notify]
  );

  const loadPlatformOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const data = await apiRequest("/api/admin/orders");
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error.message || "Could not load platform orders.");
    } finally {
      setLoadingOrders(false);
    }
  }, [apiRequest, notify]);

  const loadPlatformPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const data = await apiRequest("/api/admin/payments");
      setPayments(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error.message || "Could not load payment records.");
    } finally {
      setLoadingPayments(false);
    }
  }, [apiRequest, notify]);

  useEffect(() => {
    let active = true;
    async function initAdminData() {
      try {
        const [statsData, pharmaciesData] = await Promise.all([
          apiRequest("/api/admin/stats"),
          apiRequest("/api/admin/pharmacies")
        ]);
        if (!active) return;
        setStats(statsData);
        setPharmacies(Array.isArray(pharmaciesData) ? pharmaciesData : []);
      } catch (error) {
        if (active) {
          notify(error.message || "Could not load admin dashboard data.");
        }
      } finally {
        if (active) {
          setLoadingPharmacies(false);
        }
      }
    }
    initAdminData();
    return () => {
      active = false;
    };
  }, [apiRequest, notify]);

  function handleStatusFilterChange(newStatus) {
    setStatusFilter(newStatus);
    loadPharmacies(newStatus, pharmacySearch);
  }

  function handlePharmacySearchSubmit(e) {
    e.preventDefault();
    loadPharmacies(statusFilter, pharmacySearch);
  }

  function handleRoleFilterChange(newRole) {
    setRoleFilter(newRole);
    loadUsers(newRole, userSearch);
  }

  function handleUserSearchSubmit(e) {
    e.preventDefault();
    loadUsers(roleFilter, userSearch);
  }

  async function verifyPharmacy(pharmacyId, status, reason = "") {
    setActionLoadingId(pharmacyId);
    try {
      const data = await apiRequest(
        `/api/admin/pharmacies/${pharmacyId}/verify`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            rejectionReason: reason
          })
        }
      );

      notify(data.message || "Pharmacy verification updated.");
      setRejectingId(null);
      setRejectionReason("");
      await Promise.all([
        loadStats(),
        loadPharmacies(statusFilter, pharmacySearch)
      ]);
    } catch (error) {
      notify(error.message || "Could not update pharmacy verification.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function toggleUserStatus(targetUser) {
    const nextStatus = targetUser.isActive === false;
    const actionLabel = nextStatus ? "activate" : "deactivate";

    if (
      !window.confirm(
        `Are you sure you want to ${actionLabel} ${targetUser.name} (${targetUser.email})?`
      )
    ) {
      return;
    }

    setActionLoadingId(targetUser._id);
    try {
      const data = await apiRequest(`/api/admin/users/${targetUser._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: nextStatus })
      });

      notify(data.message);
      await loadUsers(roleFilter, userSearch);
    } catch (error) {
      notify(error.message || "Could not update user status.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleAdminDeleteMedicine(medId) {
    if (!window.confirm("Remove this medicine from the platform catalog?")) {
      return;
    }
    try {
      const data = await apiRequest(`/api/admin/medicines/${medId}`, {
        method: "DELETE"
      });
      notify(data.message);
      loadCatalogMedicines(medSearch);
      loadStats();
    } catch (error) {
      notify(error.message || "Could not remove medicine.");
    }
  }

  return (
    <section className="dashboard admin-dashboard">
      <h2>Platform Administration & Governance</h2>

      {/* Platform Analytics Overview */}
      <div className="stats-grid admin-stats-grid">
        <article className="stat-card">
          <h3>{stats.pendingPharmacies}</h3>
          <p>Pending Pharmacies</p>
        </article>
        <article className="stat-card">
          <h3>{stats.approvedPharmacies}</h3>
          <p>Approved Pharmacies</p>
        </article>
        <article className="stat-card">
          <h3>{stats.totalUsers}</h3>
          <p>Registered Users</p>
        </article>
        <article className="stat-card">
          <h3>{stats.totalMedicines}</h3>
          <p>Catalog Medicines</p>
        </article>
        <article className="stat-card">
          <h3>{stats.totalOrders || 0}</h3>
          <p>Total Orders</p>
        </article>
        <article className="stat-card">
          <h3>₹{(stats.totalRevenue || 0).toFixed(0)}</h3>
          <p>Platform GMV</p>
        </article>
      </div>

      {/* Admin Module Switcher */}
      <div className="tabs admin-subtabs">
        <button
          type="button"
          className={adminTab === "pharmacies" ? "active" : ""}
          onClick={() => {
            setAdminTab("pharmacies");
            loadPharmacies(statusFilter, pharmacySearch);
          }}
        >
          🏥 Pharmacies ({stats.totalPharmacies})
        </button>

        <button
          type="button"
          className={adminTab === "users" ? "active" : ""}
          onClick={() => {
            setAdminTab("users");
            loadUsers(roleFilter, userSearch);
          }}
        >
          👥 Users ({stats.totalUsers})
        </button>

        <button
          type="button"
          className={adminTab === "catalog" ? "active" : ""}
          onClick={() => {
            setAdminTab("catalog");
            loadCatalogMedicines(medSearch);
          }}
        >
          💊 Medicine Catalog ({stats.totalMedicines})
        </button>

        <button
          type="button"
          className={adminTab === "orders" ? "active" : ""}
          onClick={() => {
            setAdminTab("orders");
            loadPlatformOrders();
          }}
        >
          📦 Order Monitoring
        </button>

        <button
          type="button"
          className={adminTab === "payments" ? "active" : ""}
          onClick={() => {
            setAdminTab("payments");
            loadPlatformPayments();
          }}
        >
          💳 Payment Monitoring
        </button>
      </div>

      {/* 1. PHARMACY VERIFICATION & SUSPENSION PANEL */}
      {adminTab === "pharmacies" && (
        <div className="admin-panel">
          <div className="admin-filter-bar">
            <div className="filter-pills">
              <button
                type="button"
                className={statusFilter === "all" ? "pill active" : "pill"}
                onClick={() => handleStatusFilterChange("all")}
              >
                All ({stats.totalPharmacies})
              </button>
              <button
                type="button"
                className={statusFilter === "pending" ? "pill active" : "pill"}
                onClick={() => handleStatusFilterChange("pending")}
              >
                ⏳ Pending ({stats.pendingPharmacies})
              </button>
              <button
                type="button"
                className={statusFilter === "approved" ? "pill active" : "pill"}
                onClick={() => handleStatusFilterChange("approved")}
              >
                ✅ Approved ({stats.approvedPharmacies})
              </button>
              <button
                type="button"
                className={statusFilter === "rejected" ? "pill active" : "pill"}
                onClick={() => handleStatusFilterChange("rejected")}
              >
                ❌ Rejected ({stats.rejectedPharmacies})
              </button>
              <button
                type="button"
                className={statusFilter === "suspended" ? "pill active" : "pill"}
                onClick={() => handleStatusFilterChange("suspended")}
              >
                🚫 Suspended ({stats.suspendedPharmacies || 0})
              </button>
            </div>

            <form
              className="admin-search-form"
              onSubmit={handlePharmacySearchSubmit}
            >
              <input
                placeholder="Search pharmacy name, license, phone, address..."
                value={pharmacySearch}
                onChange={e => setPharmacySearch(e.target.value)}
              />
              <button type="submit">Filter</button>
            </form>
          </div>

          {loadingPharmacies ? (
            <p className="admin-empty">Loading pharmacy records...</p>
          ) : pharmacies.length === 0 ? (
            <p className="admin-empty">No pharmacies match the current filter.</p>
          ) : (
            <div className="results-grid admin-cards-grid">
              {pharmacies.map(item => {
                const status = item.verificationStatus || "pending";
                return (
                  <article className="medicine-card admin-card" key={item._id}>
                    <div className="admin-card-header">
                      <div>
                        <h3>{item.pharmacyName}</h3>
                        <span
                          className={`status-badge status-${
                            status === "suspended" ? "rejected" : status
                          }`}
                        >
                          {status === "approved"
                            ? "Approved"
                            : status === "rejected"
                              ? "Rejected"
                              : status === "suspended"
                                ? "Suspended"
                                : "Pending Verification"}
                        </span>
                      </div>
                      {item.profileImage ? (
                        <img
                          src={item.profileImage}
                          alt={item.pharmacyName}
                          className="admin-pharmacy-thumb"
                        />
                      ) : (
                        <div className="admin-pharmacy-thumb thumb-placeholder">
                          🏥
                        </div>
                      )}
                    </div>

                    <p>
                      <strong>License Number:</strong>{" "}
                      {item.licenseNumber || "Not provided"}
                    </p>
                    <p>
                      <strong>Address:</strong> {item.address}
                    </p>
                    <p>
                      <strong>Pharmacy Phone:</strong>{" "}
                      {item.phone || "Not provided"}
                    </p>
                    <p>
                      <strong>Hours:</strong>{" "}
                      {item.openingTime && item.closingTime
                        ? `${item.openingTime} – ${item.closingTime}`
                        : "Not specified"}
                    </p>
                    <p>
                      <strong>GPS:</strong>{" "}
                      {item.latitude != null && item.longitude != null
                        ? `${item.latitude}, ${item.longitude}`
                        : "Not set"}
                    </p>
                    <p>
                      <strong>Owner:</strong>{" "}
                      {item.owner
                        ? `${item.owner.name} (${item.owner.email})`
                        : "Unassigned / Legacy Record"}
                    </p>
                    <p>
                      <strong>Inventory:</strong> {item.totalMedicines || 0}{" "}
                      total ({item.inStockMedicines || 0} in stock)
                    </p>

                    {["rejected", "suspended"].includes(status) &&
                      item.rejectionReason && (
                        <p className="rejection-note">
                          <strong>Reason:</strong> {item.rejectionReason}
                        </p>
                      )}

                    {status === "approved" && item.verifiedAt && (
                      <p className="updated">
                        Verified on:{" "}
                        {new Date(item.verifiedAt).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short"
                        })}
                      </p>
                    )}

                    {item.latitude != null && item.longitude != null && (
                      <a
                        className="directions-link"
                        href={`https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View Location on Map ↗
                      </a>
                    )}

                    <div className="card-actions admin-actions">
                      {status !== "approved" && (
                        <button
                          type="button"
                          className="approve-btn"
                          disabled={actionLoadingId === item._id}
                          onClick={() => verifyPharmacy(item._id, "approved")}
                        >
                          ✓ Approve
                        </button>
                      )}

                      {status !== "rejected" && (
                        <button
                          type="button"
                          className="delete-btn"
                          disabled={actionLoadingId === item._id}
                          onClick={() => {
                            setRejectingId(item._id);
                            setRejectionReason(item.rejectionReason || "");
                          }}
                        >
                          ✕ Reject
                        </button>
                      )}

                      {status === "approved" && (
                        <button
                          type="button"
                          className="pending-btn"
                          disabled={actionLoadingId === item._id}
                          onClick={() =>
                            verifyPharmacy(
                              item._id,
                              "suspended",
                              "Suspended by administrator."
                            )
                          }
                        >
                          🚫 Suspend
                        </button>
                      )}

                      {status !== "pending" && (
                        <button
                          type="button"
                          className="pending-btn"
                          disabled={actionLoadingId === item._id}
                          onClick={() => verifyPharmacy(item._id, "pending")}
                        >
                          ↺ Set Pending
                        </button>
                      )}
                    </div>

                    {rejectingId === item._id && (
                      <div className="reject-reason-box">
                        <input
                          placeholder="Reason for rejection (shown to pharmacy owner)..."
                          value={rejectionReason}
                          onChange={e => setRejectionReason(e.target.value)}
                        />
                        <div className="reject-reason-actions">
                          <button
                            type="button"
                            className="delete-btn"
                            disabled={actionLoadingId === item._id}
                            onClick={() =>
                              verifyPharmacy(
                                item._id,
                                "rejected",
                                rejectionReason ||
                                  "Verification requirements not met."
                              )
                            }
                          >
                            Confirm Reject
                          </button>
                          <button
                            type="button"
                            className="cancel-button"
                            onClick={() => {
                              setRejectingId(null);
                              setRejectionReason("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. USER MANAGEMENT PANEL */}
      {adminTab === "users" && (
        <div className="admin-panel">
          <div className="admin-filter-bar">
            <div className="filter-pills">
              <button
                type="button"
                className={roleFilter === "all" ? "pill active" : "pill"}
                onClick={() => handleRoleFilterChange("all")}
              >
                All Users
              </button>
              <button
                type="button"
                className={roleFilter === "customer" ? "pill active" : "pill"}
                onClick={() => handleRoleFilterChange("customer")}
              >
                Customers
              </button>
              <button
                type="button"
                className={roleFilter === "pharmacy" ? "pill active" : "pill"}
                onClick={() => handleRoleFilterChange("pharmacy")}
              >
                Pharmacy Owners
              </button>
            </div>

            <form
              className="admin-search-form"
              onSubmit={handleUserSearchSubmit}
            >
              <input
                placeholder="Search user name, email, or phone..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
              />
              <button type="submit">Filter</button>
            </form>
          </div>

          {loadingUsers ? (
            <p className="admin-empty">Loading users...</p>
          ) : users.length === 0 ? (
            <p className="admin-empty">No users match the current filter.</p>
          ) : (
            <div className="results-grid admin-cards-grid">
              {users.map(u => {
                const isActive = u.isActive !== false;
                return (
                  <article className="medicine-card admin-card" key={u._id}>
                    <div className="admin-card-header">
                      <div>
                        <h3>{u.name}</h3>
                        <span
                          className={`status-badge ${
                            isActive ? "status-approved" : "status-rejected"
                          }`}
                        >
                          {isActive ? "Active" : "Deactivated"}
                        </span>
                      </div>
                      <span className="role-chip">
                        {u.role === "pharmacy" ? "Pharmacy Owner" : "Customer"}
                      </span>
                    </div>

                    <p>
                      <strong>Email:</strong> {u.email}
                    </p>
                    <p>
                      <strong>Phone:</strong> {u.phone || "Not provided"}
                    </p>
                    <p className="updated">
                      Joined:{" "}
                      {u.createdAt
                        ? new Date(u.createdAt).toLocaleDateString("en-IN", {
                            dateStyle: "medium"
                          })
                        : "N/A"}
                    </p>

                    <div className="card-actions admin-actions">
                      <button
                        type="button"
                        className={isActive ? "delete-btn" : "approve-btn"}
                        disabled={actionLoadingId === u._id}
                        onClick={() => toggleUserStatus(u)}
                      >
                        {isActive ? "Deactivate Account" : "Activate Account"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. MEDICINE CATALOG MANAGEMENT */}
      {adminTab === "catalog" && (
        <div className="admin-panel">
          <div className="admin-filter-bar">
            <form
              className="admin-search-form"
              onSubmit={e => {
                e.preventDefault();
                loadCatalogMedicines(medSearch);
              }}
            >
              <input
                placeholder="Search medicine name across all pharmacies..."
                value={medSearch}
                onChange={e => setMedSearch(e.target.value)}
              />
              <button type="submit">Search Catalog</button>
            </form>
          </div>

          {loadingMeds ? (
            <p className="admin-empty">Loading medicine catalog...</p>
          ) : medicines.length === 0 ? (
            <p className="admin-empty">No medicines found.</p>
          ) : (
            <div className="results-grid admin-cards-grid">
              {medicines.map(med => (
                <article className="medicine-card admin-card" key={med._id}>
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
                        med.available && med.quantity > 0
                          ? "status-approved"
                          : "status-rejected"
                      }`}
                    >
                      Qty: {med.quantity}
                    </span>
                  </div>
                  <p>
                    <strong>Pharmacy:</strong>{" "}
                    {med.pharmacy?.pharmacyName || "Unknown"}
                  </p>
                  <p>
                    <strong>Price:</strong>{" "}
                    {med.price == null ? "Not listed" : `₹${med.price}`}
                  </p>
                  <div className="card-actions admin-actions">
                    <button
                      type="button"
                      className="delete-btn"
                      onClick={() => handleAdminDeleteMedicine(med._id)}
                    >
                      Remove Listing
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. ORDER MONITORING */}
      {adminTab === "orders" && (
        <div className="admin-panel">
          {loadingOrders ? (
            <p className="admin-empty">Loading platform orders...</p>
          ) : orders.length === 0 ? (
            <p className="admin-empty">No orders placed on the platform yet.</p>
          ) : (
            <div className="results-grid admin-cards-grid">
              {orders.map(o => (
                <article className="medicine-card admin-card" key={o._id}>
                  <div className="admin-card-header">
                    <div>
                      <h3>#{o.orderNumber}</h3>
                      <span className="status-badge status-approved">
                        {o.orderStatus.replace(/_/g, " ").toUpperCase()}
                      </span>
                    </div>
                    <strong>₹{o.totalAmount?.toFixed(2)}</strong>
                  </div>
                  <p>
                    <strong>Customer:</strong> {o.customer?.name} (
                    {o.customer?.email})
                  </p>
                  <p>
                    <strong>Pharmacy:</strong> {o.pharmacy?.pharmacyName}
                  </p>
                  <p>
                    <strong>Fulfillment:</strong>{" "}
                    {o.fulfillmentType.toUpperCase()}
                  </p>
                  <p>
                    <strong>Payment:</strong>{" "}
                    {o.paymentStatus.toUpperCase()} (
                    {o.payment?.gatewayPaymentId || "Pending"})
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. PAYMENT MONITORING */}
      {adminTab === "payments" && (
        <div className="admin-panel">
          {loadingPayments ? (
            <p className="admin-empty">Loading payment transactions...</p>
          ) : payments.length === 0 ? (
            <p className="admin-empty">No payment transactions recorded yet.</p>
          ) : (
            <div className="results-grid admin-cards-grid">
              {payments.map(p => (
                <article className="medicine-card admin-card" key={p._id}>
                  <div className="admin-card-header">
                    <div>
                      <h3>₹{p.amount?.toFixed(2)}</h3>
                      <span
                        className={`status-badge ${
                          p.status === "paid"
                            ? "status-approved"
                            : p.status === "refunded"
                              ? "status-pending"
                              : "status-rejected"
                        }`}
                      >
                        {p.status.toUpperCase()}
                      </span>
                    </div>
                    <span className="role-chip">
                      {p.gateway.toUpperCase()} ({p.method})
                    </span>
                  </div>
                  <p>
                    <strong>Order:</strong> #{p.order?.orderNumber}
                  </p>
                  <p>
                    <strong>Customer:</strong> {p.customer?.name} (
                    {p.customer?.email})
                  </p>
                  <p>
                    <strong>Pharmacy:</strong> {p.pharmacy?.pharmacyName}
                  </p>
                  <p className="updated">
                    Gateway Order: {p.gatewayOrderId}
                    {p.gatewayPaymentId ? ` • Pay ID: ${p.gatewayPaymentId}` : ""}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default AdminDashboard;
