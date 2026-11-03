
import { useEffect, useState, useRef } from "react";
import "./App.css";

const API_URL = "http://localhost:5000";

function App() {
  const authFormRef = useRef(null);

  const [role, setRole] = useState("customer");
  const [page, setPage] = useState("login");
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(
    localStorage.getItem("medifindToken") || ""
  );

  const [pharmacy, setPharmacy] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    pharmacyName: "",
    address: "",
    phone: "",
    latitude: "",
    longitude: "",
    openingTime: "",
    closingTime: "",
    profileImage: ""
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [login, setLogin] = useState({
    email: "",
    password: ""
  });

  const [registration, setRegistration] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    pharmacyName: "",
    address: "",
    latitude: "",
    longitude: "",
    openingTime: "",
    closingTime: ""
  });

  const [medicine, setMedicine] = useState("");
  const [results, setResults] = useState([]);
  const [customerLocation, setCustomerLocation] = useState(null);
  const [inventory, setInventory] = useState([]);

  const [form, setForm] = useState({
    name: "",
    quantity: "",
    price: ""
  });

  const [activeTab, setActiveTab] = useState("search");

  function notify(text) {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  }

  // Automatically scroll to login/register form
  function scrollToAuthForm() {
    setTimeout(() => {
      authFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 150);
  }

  async function apiRequest(endpoint, options = {}, currentToken = token) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(currentToken
          ? { Authorization: `Bearer ${currentToken}` }
          : {}),
        ...options.headers
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Something went wrong.");
    }

    return data;
  }

  // Restore previous login
  useEffect(() => {
    const savedToken = localStorage.getItem("medifindToken");
    const savedUser = localStorage.getItem("medifindUser");

    if (savedToken && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);

        setToken(savedToken);
        setUser(parsedUser);
        setRole(parsedUser.role);

        if (parsedUser.role === "pharmacy") {
          setActiveTab("inventory");
          loadPharmacyProfile(savedToken);
          loadInventory(savedToken);
        }
      } catch {
        localStorage.removeItem("medifindToken");
        localStorage.removeItem("medifindUser");
      }
    }
  }, []);

  // Registration
  async function register(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const endpoint =
        role === "customer"
          ? "/api/auth/register/customer"
          : "/api/auth/register/pharmacy";

      const body =
        role === "customer"
          ? {
              name: registration.name,
              email: registration.email,
              phone: registration.phone,
              password: registration.password
            }
          : registration;

      await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(body)
      });

      notify("Registration successful! Please login.");

      setLogin({
        email: registration.email,
        password: ""
      });

      setPage("login");
      scrollToAuthForm();
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  }

  // Login
  async function loginUser(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await apiRequest(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            ...login,
            role
          })
        },
        ""
      );

      localStorage.setItem("medifindToken", data.token);
      localStorage.setItem("medifindUser", JSON.stringify(data.user));

      setToken(data.token);
      setUser(data.user);
      setPharmacy(data.pharmacy);

      if (data.user.role === "pharmacy") {
        setActiveTab("inventory");
        await loadPharmacyProfile(data.token);
        await loadInventory(data.token);
      } else {
        setActiveTab("search");
      }

      notify("Login successful! Welcome to MediFind.");
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  }

  // Pharmacy profile
  async function loadPharmacyProfile(currentToken = token) {
    try {
      const data = await apiRequest(
        "/api/pharmacy/me",
        {},
        currentToken
      );

      setPharmacy(data);
      setProfileForm({
        pharmacyName: data.pharmacyName || "",
        address: data.address || "",
        phone: data.phone || "",
        latitude: data.latitude ?? "",
        longitude: data.longitude ?? "",
        openingTime: data.openingTime || "",
        closingTime: data.closingTime || "",
        profileImage: data.profileImage || ""
      });
    } catch (error) {
      notify(error.message);
    }
  }

  // Load only owner's medicines
  async function loadInventory(currentToken = token) {
    try {
      const data = await apiRequest(
        "/api/medicines/my-inventory",
        {},
        currentToken
      );

      setInventory(data);
    } catch (error) {
      notify(error.message);
    }
  }

  // Logout
  function logout() {
    const confirmed = window.confirm("Are you sure you want to logout of MediFind?");
    if (!confirmed) return;

    localStorage.removeItem("medifindToken");
    localStorage.removeItem("medifindUser");

    setToken("");
    setUser(null);
    setPharmacy(null);
    setInventory([]);
    setResults([]);

    setPage("login");
    setRole("customer");

    notify("Logged out successfully.");
  }

  // Capture pharmacy GPS
  function captureLocation() {
    if (!navigator.geolocation) {
      notify("Location is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        setRegistration(previous => ({
          ...previous,
          latitude: position.coords.latitude.toString(),
          longitude: position.coords.longitude.toString()
        }));

        notify("Pharmacy location captured successfully!");
      },
      () => notify("Unable to get location. Allow location permission."),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  }

  // Update pharmacy profile
  async function savePharmacyProfile(e) {
    e.preventDefault();
    setProfileSaving(true);

    try {
      const payload = {
        ...profileForm,
        latitude: profileForm.latitude === "" ? null : Number(profileForm.latitude),
        longitude: profileForm.longitude === "" ? null : Number(profileForm.longitude)
      };

      const data = await apiRequest("/api/pharmacy/me", {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      setPharmacy(data.pharmacy || data);
      const saved = data.pharmacy || data;
      setProfileForm({
        pharmacyName: saved.pharmacyName || "",
        address: saved.address || "",
        phone: saved.phone || "",
        latitude: saved.latitude ?? "",
        longitude: saved.longitude ?? "",
        openingTime: saved.openingTime || "",
        closingTime: saved.closingTime || "",
        profileImage: saved.profileImage || ""
      });
      setEditingProfile(false);
      notify("Pharmacy profile updated successfully!");
    } catch (error) {
      notify(error.message || "Could not update pharmacy profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  function handleProfileImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      notify("Please select an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      notify("Please choose an image smaller than 2 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfileForm(previous => ({
        ...previous,
        profileImage: reader.result
      }));
      notify("Image selected. Click Save Profile to keep it.");
    };
    reader.onerror = () => notify("Could not read this image.");
    reader.readAsDataURL(file);
  }

  function captureProfileLocation() {
    if (!navigator.geolocation) {
      notify("Location is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        setProfileForm(previous => ({
          ...previous,
          latitude: position.coords.latitude.toString(),
          longitude: position.coords.longitude.toString()
        }));
        notify("Pharmacy location captured.");
      },
      () => notify("Unable to get location. Allow location permission."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // Customer medicine search
async function searchMedicine(e) {
  e.preventDefault();

  if (!medicine.trim()) {
    notify("Please enter a medicine name.");
    return;
  }

  setLoading(true);
  setResults([]);

  try {
    // Get customer's current GPS location
    let customerCoords = null;

    if (navigator.geolocation) {
      try {
        customerCoords = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            position => resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            }),
            reject,
            { enableHighAccuracy: true, timeout: 10000 }
          );
        });

        setCustomerLocation(customerCoords);
      } catch {
        setCustomerLocation(null);
        notify("Location unavailable. Showing pharmacies without distance sorting.");
      }
    }

    const data = await apiRequest(
      `/api/medicines/search?name=${encodeURIComponent(medicine)}`
    );

    let medicineResults = Array.isArray(data) ? data : [];

    // Calculate distance using the Haversine formula
    if (customerCoords) {
      medicineResults = medicineResults.map(item => {
        const pharmacy = item.pharmacy;

        if (
          !pharmacy ||
          pharmacy.latitude == null ||
          pharmacy.longitude == null
        ) {
          return { ...item, distance: null };
        }

        const toRadians = value => value * Math.PI / 180;

        const lat1 = customerCoords.latitude;
        const lon1 = customerCoords.longitude;
        const lat2 = Number(pharmacy.latitude);
        const lon2 = Number(pharmacy.longitude);

        const R = 6371;

        const dLat = toRadians(lat2 - lat1);
        const dLon = toRadians(lon2 - lon1);

        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRadians(lat1)) *
          Math.cos(toRadians(lat2)) *
          Math.sin(dLon / 2) ** 2;

        const distance =
          2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return { ...item, distance };
      });

      // Nearest pharmacies first; pharmacies without GPS go last
      medicineResults.sort((a, b) => {
        if (a.distance == null) return 1;
        if (b.distance == null) return -1;
        return a.distance - b.distance;
      });
    }

    setResults(medicineResults);

    if (!medicineResults.length) {
      notify("No matching medicines found.");
    }

  } catch (error) {
    notify(error.message);
  } finally {
    setLoading(false);
  }
}

  // Add medicine
  async function addMedicine(e) {
    e.preventDefault();

    try {
      await apiRequest("/api/medicines", {
        method: "POST",
        body: JSON.stringify(form)
      });

      notify("Medicine added successfully!");

      setForm({
        name: "",
        quantity: "",
        price: ""
      });

      loadInventory();
    } catch (error) {
      notify(error.message);
    }
  }

  // Update stock
  async function updateStock(item) {
    const quantity = window.prompt(
      `Enter new quantity for ${item.name}:`,
      item.quantity
    );

    if (quantity === null) return;

    if (
      quantity.trim() === "" ||
      !Number.isInteger(Number(quantity)) ||
      Number(quantity) < 0
    ) {
      notify("Enter a valid quantity.");
      return;
    }

    try {
      await apiRequest(`/api/medicines/${item._id}`, {
        method: "PUT",
        body: JSON.stringify({
          quantity: Number(quantity)
        })
      });

      notify("Stock updated successfully!");
      loadInventory();
    } catch (error) {
      notify(error.message);
    }
  }

  // Delete medicine
  async function deleteMedicine(id) {
    if (!window.confirm("Are you sure you want to delete this medicine?")) {
      return;
    }

    try {
      await apiRequest(`/api/medicines/${id}`, {
        method: "DELETE"
      });

      notify("Medicine deleted successfully!");
      loadInventory();
    } catch (error) {
      notify(error.message);
    }
  }

  // LOGIN AND REGISTRATION PAGE
  if (!user) {
    return (
      <div className="app">
        <nav className="navbar">
          <a href="#home" className="logo">💊 MediFind</a>
        </nav>

        <main>
          <section className="hero" id="home">
            <span className="tag">YOUR HEALTH, OUR PRIORITY</span>

            <h1>
              Welcome to <span>MediFind</span>
            </h1>

            <p>
              Find medicines and discover pharmacies near you.
            </p>

            {message && (
              <div className="toast-message">{message}</div>
            )}

            <div className="tabs">
              <button
                className={role === "customer" ? "active" : ""}
                onClick={() => {
                  setRole("customer");
                  scrollToAuthForm();
                }}
              >
                Customer
              </button>

              <button
                className={role === "pharmacy" ? "active" : ""}
                onClick={() => {
                  setRole("pharmacy");
                  scrollToAuthForm();
                }}
              >
                Pharmacy Owner
              </button>
            </div>

            <div
              className="form-section"
              ref={authFormRef}
            >
              <h2>
                {page === "login" ? "Login" : "Create Account"}
              </h2>

              <form
                className="medicine-form"
                onSubmit={page === "login" ? loginUser : register}
              >
                {page === "register" && (
                  <>
                    <input
                      placeholder="Full name"
                      required
                      value={registration.name}
                      onChange={e =>
                        setRegistration({
                          ...registration,
                          name: e.target.value
                        })
                      }
                    />

                    <input
                      placeholder="Phone number"
                      required={role === "pharmacy"}
                      value={registration.phone}
                      onChange={e =>
                        setRegistration({
                          ...registration,
                          phone: e.target.value
                        })
                      }
                    />

                    {role === "pharmacy" && (
                      <>
                        <input
                          placeholder="Pharmacy name"
                          required
                          value={registration.pharmacyName}
                          onChange={e =>
                            setRegistration({
                              ...registration,
                              pharmacyName: e.target.value
                            })
                          }
                        />

                        <input
                          placeholder="Full pharmacy address"
                          required
                          value={registration.address}
                          onChange={e =>
                            setRegistration({
                              ...registration,
                              address: e.target.value
                            })
                          }
                        />

                        <label>Pharmacy Opening Time</label>
                        <input
                          type="time"
                          required
                          value={registration.openingTime}
                          onChange={e =>
                            setRegistration({
                              ...registration,
                              openingTime: e.target.value
                            })
                          }
                        />

                        <label>Pharmacy Closing Time</label>
                        <input
                          type="time"
                          required
                          value={registration.closingTime}
                          onChange={e =>
                            setRegistration({
                              ...registration,
                              closingTime: e.target.value
                            })
                          }
                        />

                        <button
                          type="button"
                          onClick={captureLocation}
                        >
                          📍 Capture Pharmacy GPS
                        </button>

                        {registration.latitude && (
                          <p className="location-success">
                            ✓ Pharmacy GPS captured
                          </p>
                        )}
                      </>
                    )}
                  </>
                )}

                <input
                  type="email"
                  placeholder="Email address"
                  required
                  value={
                    page === "login"
                      ? login.email
                      : registration.email
                  }
                  onChange={e =>
                    page === "login"
                      ? setLogin({
                          ...login,
                          email: e.target.value
                        })
                      : setRegistration({
                          ...registration,
                          email: e.target.value
                        })
                  }
                />

                <input
                  type="password"
                  placeholder="Password (minimum 8 characters)"
                  required
                  minLength={8}
                  value={
                    page === "login"
                      ? login.password
                      : registration.password
                  }
                  onChange={e =>
                    page === "login"
                      ? setLogin({
                          ...login,
                          password: e.target.value
                        })
                      : setRegistration({
                          ...registration,
                          password: e.target.value
                        })
                  }
                />

                <button type="submit" disabled={loading}>
                  {loading
                    ? "Please wait..."
                    : page === "login"
                      ? "Login"
                      : "Register"}
                </button>
              </form>

              <p>
                {page === "login"
                  ? "Don't have an account?"
                  : "Already have an account?"}

                {" "}

                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setPage(
                      page === "login" ? "register" : "login"
                    );
                    scrollToAuthForm();
                  }}
                >
                  {page === "login" ? "Register" : "Login"}
                </button>
              </p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // LOGGED-IN APPLICATION
  return (
    <div className="app">
      <nav className="navbar">
        <a href="#home" className="logo">💊 MediFind</a>

        <div className="nav-links">
          <span>Hi, {user.name}</span>
          <button className="logout-button" onClick={logout}>Logout</button>
        </div>
      </nav>

      <main>
        <section className="hero" id="home">
          <span className="tag">
            {user.role === "customer"
              ? "CUSTOMER ACCOUNT"
              : "PHARMACY OWNER ACCOUNT"}
          </span>

          <h1>
            Welcome to <span>MediFind</span>
          </h1>

          {message && (
            <div className="toast-message">{message}</div>
          )}

          <div className="tabs">
            {user.role === "customer" ? (
              <button
                className={activeTab === "search" ? "active" : ""}
                onClick={() => setActiveTab("search")}
              >
                Search Medicines
              </button>
            ) : (
              <>
                <button
                  className={activeTab === "inventory" ? "active" : ""}
                  onClick={() => setActiveTab("inventory")}
                >
                  My Inventory
                </button>

                <button
                  className={activeTab === "add" ? "active" : ""}
                  onClick={() => setActiveTab("add")}
                >
                  Add Medicine
                </button>

                <button
                  className={activeTab === "profile" ? "active" : ""}
                  onClick={() => setActiveTab("profile")}
                >
                  Pharmacy Profile
                </button>
              </>
            )}
          </div>

          {activeTab === "search" && user.role === "customer" && (
            <>
              <form className="search-box" onSubmit={searchMedicine}>
                <span>🔎</span>

                <input
                  placeholder="Enter medicine name..."
                  value={medicine}
                  onChange={e => setMedicine(e.target.value)}
                />

                <button disabled={loading}>
                  {loading ? "Searching..." : "Search"}
                </button>
              </form>

              <div className="results-grid">
                {results.map(item => (
                  <article className="medicine-card" key={item._id}>
                    <h3>{item.name}</h3>
                      {item.distance != null && (
                      <p className="distance-info">
                        📍 {item.distance < 1
                          ? `${(item.distance * 1000).toFixed(0)} metres away`
                          : `${item.distance.toFixed(2)} km away`}
                        {results.findIndex(result => result.distance != null) ===
                          results.indexOf(item) && (
                            <strong> • Nearest</strong>
                          )}
                      </p>
                    )}

                    <p>
                      <strong>Pharmacy:</strong>{" "}
                      {item.pharmacy?.pharmacyName}
                    </p>

                    <p>
                      <strong>Address:</strong>{" "}
                      {item.pharmacy?.address}
                    </p>

                    <p>
                      <strong>Phone:</strong>{" "}
                      {item.pharmacy?.phone || "Not provided"}
                    </p>

                    <p>
                      <strong>Quantity:</strong> {item.quantity}
                    </p>

                    <p>
                      <strong>Price:</strong>{" "}
                      {item.price == null
                        ? "Not listed"
                        : `₹${item.price}`}
                    </p>

                    <p className="last-updated">
                      🕒 Last stock update:{" "}
                      {item.lastUpdated
                        ? new Date(item.lastUpdated).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short"
                          })
                        : "Not available"}
                    </p>

                    {item.pharmacy?.latitude != null &&
                      item.pharmacy?.longitude != null && (
                        <a
                          className="directions-link"
                          href={`https://www.google.com/maps/dir/?api=1&destination=${item.pharmacy.latitude},${item.pharmacy.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Get Directions ↗
                        </a>
                      )}
                  </article>
                ))}
              </div>
            </>
          )}

          {activeTab === "add" && user.role === "pharmacy" && (
            <section className="form-section">
              <h2>Add Medicine to Inventory</h2>

              <p>
                {pharmacy?.pharmacyName || "Your Pharmacy"}
              </p>

              <form className="medicine-form" onSubmit={addMedicine}>
                <input
                  placeholder="Medicine name"
                  required
                  value={form.name}
                  onChange={e =>
                    setForm({
                      ...form,
                      name: e.target.value
                    })
                  }
                />

                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Available quantity"
                  required
                  value={form.quantity}
                  onChange={e =>
                    setForm({
                      ...form,
                      quantity: e.target.value
                    })
                  }
                />

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Price (optional)"
                  value={form.price}
                  onChange={e =>
                    setForm({
                      ...form,
                      price: e.target.value
                    })
                  }
                />

                <button type="submit">Add Medicine</button>
              </form>
            </section>
          )}

          {activeTab === "inventory" && user.role === "pharmacy" && (
            <section className="dashboard">
              <h2>My Pharmacy Inventory</h2>

              <div className="stats-grid stats-grid-two">
                <article className="stat-card">
                  <h3>{inventory.length}</h3>
                  <p>Total Medicines</p>
                </article>

                <article className="stat-card">
                  <h3>
                    {inventory.filter(item => item.quantity > 0).length}
                  </h3>
                  <p>Available Medicines</p>
                </article>
              </div>

              <div className="results-grid">
                {inventory.map(item => (
                  <article className="medicine-card" key={item._id}>
                    <h3>{item.name}</h3>

                    <p>Quantity: {item.quantity}</p>

                    <p>
                      Price:{" "}
                      {item.price == null
                        ? "Not listed"
                        : `₹${item.price}`}
                    </p>

                    <div className="card-actions">
                      <button onClick={() => updateStock(item)}>
                        Update Stock
                      </button>

                      <button
                        className="delete-btn"
                        onClick={() => deleteMedicine(item._id)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === "profile" && user.role === "pharmacy" && (
            <section className="form-section profile-section">
              <h2>Pharmacy Profile</h2>

              {pharmacy ? (
                <>
                  <div className="profile-avatar-wrap">
                    {profileForm.profileImage ? (
                      <img
                        className="pharmacy-avatar"
                        src={profileForm.profileImage}
                        alt="Pharmacy profile"
                      />
                    ) : (
                      <div className="pharmacy-avatar avatar-placeholder">🏥</div>
                    )}
                    <p className="profile-image-caption">Pharmacy profile image</p>
                  </div>

                  {!editingProfile ? (
                    <div className="profile-details">
                      <p><strong>Name:</strong> {pharmacy.pharmacyName}</p>
                      <p><strong>Address:</strong> {pharmacy.address}</p>
                      <p><strong>Phone:</strong> {pharmacy.phone || "Not provided"}</p>
                      <p><strong>Opening Time:</strong> {pharmacy.openingTime || "Not set"}</p>
                      <p><strong>Closing Time:</strong> {pharmacy.closingTime || "Not set"}</p>
                      <p><strong>GPS:</strong> {pharmacy.latitude != null && pharmacy.longitude != null
                        ? `${pharmacy.latitude}, ${pharmacy.longitude}`
                        : "Not added"}</p>
                      <button
                        type="button"
                        className="primary-action profile-edit-button"
                        onClick={() => setEditingProfile(true)}
                      >
                        Edit Profile
                      </button>
                    </div>
                  ) : (
                    <form className="medicine-form profile-edit-form" onSubmit={savePharmacyProfile}>
                      <label>Pharmacy Name</label>
                      <input
                        value={profileForm.pharmacyName}
                        required
                        onChange={e => setProfileForm({ ...profileForm, pharmacyName: e.target.value })}
                      />

                      <label>Full Address</label>
                      <textarea
                        value={profileForm.address}
                        required
                        rows="3"
                        onChange={e => setProfileForm({ ...profileForm, address: e.target.value })}
                      />

                      <label>Phone Number</label>
                      <input
                        value={profileForm.phone}
                        onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                      />

                      <label>Opening Time</label>
                      <input
                        type="time"
                        value={profileForm.openingTime}
                        onChange={e => setProfileForm({ ...profileForm, openingTime: e.target.value })}
                      />

                      <label>Closing Time</label>
                      <input
                        type="time"
                        value={profileForm.closingTime}
                        onChange={e => setProfileForm({ ...profileForm, closingTime: e.target.value })}
                      />

                      <label>Pharmacy GPS Coordinates</label>
                      <div className="coordinate-row">
                        <input
                          type="number"
                          step="any"
                          placeholder="Latitude"
                          value={profileForm.latitude}
                          onChange={e => setProfileForm({ ...profileForm, latitude: e.target.value })}
                        />
                        <input
                          type="number"
                          step="any"
                          placeholder="Longitude"
                          value={profileForm.longitude}
                          onChange={e => setProfileForm({ ...profileForm, longitude: e.target.value })}
                        />
                      </div>
                      <button type="button" className="location-button" onClick={captureProfileLocation}>
                        📍 Update GPS Location
                      </button>

                      <label>Change Pharmacy Profile Image</label>
                      <input type="file" accept="image/*" onChange={handleProfileImage} />
                      <p className="profile-image-caption">Image format: JPG, PNG or WEBP. Maximum 2 MB.</p>

                      <div className="profile-form-actions">
                        <button type="submit" disabled={profileSaving}>
                          {profileSaving ? "Saving..." : "Save Profile"}
                        </button>
                        <button
                          type="button"
                          className="cancel-button"
                          onClick={() => {
                            setEditingProfile(false);
                            loadPharmacyProfile();
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </>
              ) : (
                <p>Loading pharmacy profile...</p>
              )}
            </section>
          )}
        </section>
      </main>

      <footer>
        <p>© 2026 MediFind | Medicine Availability Finder</p>
        <p>
          Availability is pharmacy-reported. Confirm before visiting.
        </p>
      </footer>
    </div>
  );
}

export default App;
