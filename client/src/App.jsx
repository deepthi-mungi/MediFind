import { useEffect, useState, useRef, useCallback } from "react";
import "./App.css";
import AdminDashboard from "./components/AdminDashboard";
import LocationBar from "./components/LocationBar";
import NearbyPharmacies from "./components/NearbyPharmacies";
import PharmacyDetail from "./components/PharmacyDetail";
import CartCheckout from "./components/CartCheckout";
import CustomerPortal from "./components/CustomerPortal";
import PharmacyOwnerPortal from "./components/PharmacyOwnerPortal";
import InteractiveMap from "./components/InteractiveMap";

const API_URL = "http://localhost:5000";

const MEDICINE_CATEGORIES = [
  "All",
  "Fever & Pain",
  "Antibiotics",
  "Cold & Cough",
  "Diabetes Care",
  "Cardiac Care",
  "Vitamins & Supplements",
  "First Aid",
  "General"
];

function getInitialSavedUser() {
  const savedToken = localStorage.getItem("medifindToken");
  const savedUser = localStorage.getItem("medifindUser");
  if (!savedToken || !savedUser) return null;
  try {
    return JSON.parse(savedUser);
  } catch {
    localStorage.removeItem("medifindToken");
    localStorage.removeItem("medifindUser");
    return null;
  }
}

function getInitialCart() {
  try {
    const raw = localStorage.getItem("medifindCart");
    if (!raw) return { pharmacy: null, items: [] };
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items)) return parsed;
  } catch {
    // ignore
  }
  return { pharmacy: null, items: [] };
}

function getInitialLocation() {
  try {
    const raw = localStorage.getItem("medifindLocation");
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

function App() {
  const authFormRef = useRef(null);
  const initialUser = getInitialSavedUser();

  const [role, setRole] = useState(initialUser?.role || "customer");
  const [page, setPage] = useState("login");
  const [user, setUser] = useState(initialUser);
  const [token, setToken] = useState(
    initialUser ? localStorage.getItem("medifindToken") || "" : ""
  );

  const [pharmacy, setPharmacy] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    pharmacyName: "",
    address: "",
    phone: "",
    licenseNumber: "",
    latitude: "",
    longitude: "",
    openingTime: "",
    closingTime: "",
    deliveryAvailable: true,
    deliveryFee: 30,
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
    licenseNumber: "",
    address: "",
    latitude: "",
    longitude: "",
    openingTime: "",
    closingTime: ""
  });

  // Customer Search & Discovery State
  const [medicine, setMedicine] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [maxPriceFilter, setMaxPriceFilter] = useState("");
  const [sortBy, setSortBy] = useState("distance");
  const [searchRadiusKm, setSearchRadiusKm] = useState("all");
  const [includeOutOfStock, setIncludeOutOfStock] = useState(false);
  const [results, setResults] = useState([]);
  const [searchRadiusMeta, setSearchRadiusMeta] = useState(null);
  const [showSearchMap, setShowSearchMap] = useState(false);

  // Location State
  const [customerLocation, setCustomerLocation] = useState(getInitialLocation);
  const [detectingGPS, setDetectingGPS] = useState(false);
  const [locationPermissionError, setLocationPermissionError] = useState(false);

  // Selected Individual Pharmacy Storefront
  const [selectedPharmacyId, setSelectedPharmacyId] = useState(null);

  // Single-Pharmacy Shopping Cart
  const [cart, setCart] = useState(getInitialCart);

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  // Pharmacy Owner Inventory & Editing
  const [inventory, setInventory] = useState([]);
  const [editingMedicine, setEditingMedicine] = useState(null);
  const [form, setForm] = useState({
    name: "",
    strength: "",
    formulation: "Tablet",
    manufacturer: "",
    category: "General",
    quantity: "",
    price: "",
    description: "",
    requiresPrescription: false
  });

  const [activeTab, setActiveTab] = useState(
    initialUser?.role === "pharmacy"
      ? "inventory"
      : initialUser?.role === "admin"
        ? "admin"
        : "search"
  );

  const notify = useCallback(text => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3500);
  }, []);

  function scrollToAuthForm() {
    setTimeout(() => {
      authFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 150);
  }

  const apiRequest = useCallback(
    async (endpoint, options = {}, currentToken = token) => {
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
    },
    [token]
  );

  // Persist Cart
  useEffect(() => {
    localStorage.setItem("medifindCart", JSON.stringify(cart));
  }, [cart]);

  // Persist Location
  function updateCustomerLocation(newLoc) {
    setCustomerLocation(newLoc);
    setLocationPermissionError(false);
    if (newLoc) {
      localStorage.setItem("medifindLocation", JSON.stringify(newLoc));
    } else {
      localStorage.removeItem("medifindLocation");
    }
  }

  // Detect Customer GPS
  const detectCustomerGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationPermissionError(true);
      notify("Geolocation is not supported by your browser.");
      return;
    }

    setDetectingGPS(true);
    navigator.geolocation.getCurrentPosition(
      async position => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        let label = `GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

        try {
          const rev = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
          );
          const revData = await rev.json();
          if (revData?.address) {
            const parts = [
              revData.address.suburb ||
                revData.address.neighbourhood ||
                revData.address.road,
              revData.address.city ||
                revData.address.town ||
                revData.address.state_district
            ].filter(Boolean);
            if (parts.length > 0) {
              label = parts.join(", ");
            }
          }
        } catch {
          // Use coordinate label fallback
        }

        const locObj = {
          latitude: lat,
          longitude: lng,
          label,
          mode: "auto"
        };
        setCustomerLocation(locObj);
        setLocationPermissionError(false);
        localStorage.setItem("medifindLocation", JSON.stringify(locObj));
        setDetectingGPS(false);
        notify(`Location detected: ${label}`);
      },
      () => {
        setDetectingGPS(false);
        setLocationPermissionError(true);
        notify(
          "Location permission denied. You can select your location manually."
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [notify]);

  // Load Pharmacy Profile
  const loadPharmacyProfile = useCallback(
    async (currentToken = token) => {
      try {
        const data = await apiRequest("/api/pharmacy/me", {}, currentToken);
        setPharmacy(data);
        setProfileForm({
          pharmacyName: data.pharmacyName || "",
          address: data.address || "",
          phone: data.phone || "",
          licenseNumber: data.licenseNumber || "",
          latitude: data.latitude ?? "",
          longitude: data.longitude ?? "",
          openingTime: data.openingTime || "",
          closingTime: data.closingTime || "",
          deliveryAvailable: data.deliveryAvailable !== false,
          deliveryFee: data.deliveryFee ?? 30,
          profileImage: data.profileImage || ""
        });
      } catch (error) {
        notify(error.message);
      }
    },
    [apiRequest, notify, token]
  );

  // Load Pharmacy Inventory
  const loadInventory = useCallback(
    async (currentToken = token) => {
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
    },
    [apiRequest, notify, token]
  );

  // Load Notifications
  const loadNotifications = useCallback(
    async (currentToken = token) => {
      if (!currentToken) return;
      try {
        const data = await apiRequest("/api/notifications", {}, currentToken);
        setNotifications(Array.isArray(data) ? data : []);
      } catch {
        // ignore
      }
    },
    [apiRequest, token]
  );

  useEffect(() => {
    if (!token || !user) return;
    let active = true;
    async function syncSession() {
      if (user.role === "pharmacy" && active) {
        await Promise.all([
          loadPharmacyProfile(token),
          loadInventory(token),
          loadNotifications(token)
        ]);
      } else if (active) {
        await loadNotifications(token);
      }
    }
    syncSession();
    return () => {
      active = false;
    };
  }, [loadInventory, loadNotifications, loadPharmacyProfile, token, user]);

  // Autocomplete Suggestions Fetch
  useEffect(() => {
    if (!medicine.trim() || medicine.trim().length < 2) {
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await apiRequest(
          `/api/medicines/suggestions?q=${encodeURIComponent(medicine.trim())}`
        );
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setSuggestions([]);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [apiRequest, medicine]);

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

      const response = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(body)
      });

      notify(response.message || "Registration successful! Please login.");

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
      } else if (data.user.role === "admin") {
        setActiveTab("admin");
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

  // Logout
  function logout() {
    const confirmed = window.confirm(
      "Are you sure you want to logout of MediFind?"
    );
    if (!confirmed) return;

    localStorage.removeItem("medifindToken");
    localStorage.removeItem("medifindUser");

    setToken("");
    setUser(null);
    setPharmacy(null);
    setInventory([]);
    setResults([]);
    setSelectedPharmacyId(null);

    setPage("login");
    setRole("customer");

    notify("Logged out successfully.");
  }

  // Capture pharmacy GPS during registration
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

  // Save Pharmacy Profile
  async function savePharmacyProfile(e) {
    e.preventDefault();
    setProfileSaving(true);

    try {
      const payload = {
        ...profileForm,
        latitude:
          profileForm.latitude === "" ? null : Number(profileForm.latitude),
        longitude:
          profileForm.longitude === "" ? null : Number(profileForm.longitude),
        deliveryFee: Number(profileForm.deliveryFee) || 0,
        reapply: pharmacy?.verificationStatus === "rejected"
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
        licenseNumber: saved.licenseNumber || "",
        latitude: saved.latitude ?? "",
        longitude: saved.longitude ?? "",
        openingTime: saved.openingTime || "",
        closingTime: saved.closingTime || "",
        deliveryAvailable: saved.deliveryAvailable !== false,
        deliveryFee: saved.deliveryFee ?? 30,
        profileImage: saved.profileImage || ""
      });
      setEditingProfile(false);
      notify(data.message || "Pharmacy profile updated successfully!");
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

  // Customer Medicine Search
  async function executeMedicineSearch({
    queryName = medicine,
    category = selectedCategory,
    radius = searchRadiusKm,
    sort = sortBy,
    maxP = maxPriceFilter,
    outOfStock = includeOutOfStock
  } = {}) {
    if (!queryName.trim() && (!category || category === "All")) {
      notify("Please enter a medicine name or select a category.");
      return;
    }

    setLoading(true);
    setShowSuggestions(false);

    try {
      let coords = customerLocation;
      if (!coords && navigator.geolocation) {
        try {
          const detected = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              pos =>
                resolve({
                  latitude: Number(pos.coords.latitude.toFixed(6)),
                  longitude: Number(pos.coords.longitude.toFixed(6)),
                  label: "Current GPS Location",
                  mode: "auto"
                }),
              reject,
              { enableHighAccuracy: true, timeout: 6000 }
            );
          });
          coords = detected;
          updateCustomerLocation(detected);
        } catch {
          setLocationPermissionError(true);
        }
      }

      const params = new URLSearchParams();
      if (queryName.trim()) params.set("name", queryName.trim());
      if (category && category !== "All") params.set("category", category);
      if (maxP !== "" && Number.isFinite(Number(maxP))) {
        params.set("maxPrice", String(maxP));
      }
      if (outOfStock) params.set("includeOutOfStock", "true");
      if (coords?.latitude != null && coords?.longitude != null) {
        params.set("lat", coords.latitude);
        params.set("lng", coords.longitude);
      }
      params.set("radiusKm", String(radius));
      params.set("autoExpand", "true");
      params.set("sortBy", sort);
      params.set("includeMeta", "true");

      const data = await apiRequest(`/api/medicines/search?${params.toString()}`);
      const medicineResults = Array.isArray(data.results)
        ? data.results
        : Array.isArray(data)
          ? data
          : [];

      setResults(medicineResults);
      setSearchRadiusMeta(data.radiusMeta || null);

      if (!medicineResults.length) {
        notify("No matching medicines found in verified pharmacies.");
      }
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  }

  function searchMedicine(e) {
    e.preventDefault();
    executeMedicineSearch();
  }

  // Single-Pharmacy Shopping Cart Handlers
  function handleAddToCart(medicineItem, pharmacyInfo) {
    const targetPharmacy = pharmacyInfo || medicineItem.pharmacy;
    if (!targetPharmacy || !targetPharmacy._id) {
      notify("Pharmacy details missing for this medicine.");
      return;
    }

    if (medicineItem.price == null) {
      notify("Price not listed for online checkout. Please call the pharmacy.");
      return;
    }

    // Single-pharmacy cart check with confirmation prompt when switching pharmacies
    if (
      cart.pharmacy &&
      cart.items.length > 0 &&
      cart.pharmacy._id !== targetPharmacy._id
    ) {
      const confirmSwitch = window.confirm(
        `Your cart currently contains items from "${cart.pharmacy.pharmacyName}". Do you want to clear your current cart and start a new order from "${targetPharmacy.pharmacyName}"?`
      );
      if (!confirmSwitch) return;

      setCart({
        pharmacy: targetPharmacy,
        items: [
          {
            medicineId: medicineItem._id,
            name: medicineItem.name,
            strength: medicineItem.strength || "",
            formulation: medicineItem.formulation || "Tablet",
            price: Number(medicineItem.price),
            quantity: 1,
            maxStock: medicineItem.quantity,
            requiresPrescription: Boolean(medicineItem.requiresPrescription)
          }
        ]
      });
      notify(`Started a new cart with ${medicineItem.name} from ${targetPharmacy.pharmacyName}.`);
      return;
    }

    setCart(prev => {
      const existingIdx = prev.items.findIndex(
        i => i.medicineId === medicineItem._id
      );
      if (existingIdx > -1) {
        const currentQty = prev.items[existingIdx].quantity;
        if (currentQty >= medicineItem.quantity) {
          notify(`Maximum available stock (${medicineItem.quantity}) reached.`);
          return prev;
        }
        const nextItems = [...prev.items];
        nextItems[existingIdx] = {
          ...nextItems[existingIdx],
          quantity: currentQty + 1,
          maxStock: medicineItem.quantity
        };
        return {
          pharmacy: targetPharmacy,
          items: nextItems
        };
      }

      return {
        pharmacy: targetPharmacy,
        items: [
          ...prev.items,
          {
            medicineId: medicineItem._id,
            name: medicineItem.name,
            strength: medicineItem.strength || "",
            formulation: medicineItem.formulation || "Tablet",
            price: Number(medicineItem.price),
            quantity: 1,
            maxStock: medicineItem.quantity,
            requiresPrescription: Boolean(medicineItem.requiresPrescription)
          }
        ]
      };
    });

    notify(`Added ${medicineItem.name} to your cart!`);
  }

  function handleUpdateCartQty(medicineId, newQty) {
    if (newQty <= 0) {
      handleRemoveCartItem(medicineId);
      return;
    }
    setCart(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.medicineId === medicineId
          ? { ...item, quantity: Math.min(newQty, item.maxStock) }
          : item
      )
    }));
  }

  function handleRemoveCartItem(medicineId) {
    setCart(prev => {
      const nextItems = prev.items.filter(i => i.medicineId !== medicineId);
      return {
        pharmacy: nextItems.length > 0 ? prev.pharmacy : null,
        items: nextItems
      };
    });
  }

  function handleClearCart() {
    setCart({ pharmacy: null, items: [] });
  }

  // Pharmacy Owner: Add Medicine
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
        strength: "",
        formulation: "Tablet",
        manufacturer: "",
        category: "General",
        quantity: "",
        price: "",
        description: "",
        requiresPrescription: false
      });

      loadInventory();
    } catch (error) {
      notify(error.message);
    }
  }

  // Pharmacy Owner: Quick Update Stock
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

  // Pharmacy Owner: Save Full Medicine Edit Modal
  async function handleSaveMedicineEdit(e) {
    e.preventDefault();
    if (!editingMedicine) return;
    try {
      await apiRequest(`/api/medicines/${editingMedicine._id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editingMedicine.name,
          strength: editingMedicine.strength || "",
          formulation: editingMedicine.formulation || "Tablet",
          manufacturer: editingMedicine.manufacturer || "",
          category: editingMedicine.category || "General",
          quantity: Number(editingMedicine.quantity),
          price:
            editingMedicine.price === "" || editingMedicine.price === null
              ? null
              : Number(editingMedicine.price),
          description: editingMedicine.description || "",
          requiresPrescription: Boolean(editingMedicine.requiresPrescription),
          available: Boolean(editingMedicine.available)
        })
      });
      notify("Medicine details updated!");
      setEditingMedicine(null);
      loadInventory();
    } catch (error) {
      notify(error.message || "Could not update medicine.");
    }
  }

  async function toggleMedicineAvailability(item) {
    try {
      await apiRequest(`/api/medicines/${item._id}`, {
        method: "PUT",
        body: JSON.stringify({
          available: !item.available
        })
      });
      notify(
        `${item.name} marked as ${!item.available ? "Available" : "Unavailable"}.`
      );
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

  async function markAllNotificationsRead() {
    try {
      await apiRequest("/api/notifications/read-all", { method: "PATCH" });
      loadNotifications();
    } catch {
      // ignore
    }
  }

  const unreadNotifCount = notifications.filter(n => !n.isRead).length;
  const totalCartUnits = cart.items.reduce((sum, i) => sum + i.quantity, 0);

  // ====================================================
  // UNAUTHENTICATED LOGIN AND REGISTRATION SCREEN
  // ====================================================
  if (!user) {
    return (
      <div className="app">
        <nav className="navbar">
          <a href="#home" className="logo">
            💊 MediFind
          </a>
          <div className="nav-links">
            <a href="#features">Platform Features</a>
          </div>
        </nav>

        <main>
          <section className="hero" id="home">
            <span className="tag">YOUR HEALTH, OUR PRIORITY</span>

            <h1>
              Welcome to <span>MediFind</span>
            </h1>

            <p>
              Real-time multi-pharmacy medicine discovery, dynamic nearby
              pharmacy radar, and instant pickup or home delivery ordering.
            </p>

            {message && <div className="toast-message">{message}</div>}

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

              <button
                className={role === "admin" ? "active" : ""}
                onClick={() => {
                  setRole("admin");
                  setPage("login");
                  scrollToAuthForm();
                }}
              >
                Administrator
              </button>
            </div>

            <div className="form-section" ref={authFormRef}>
              <h2>
                {role === "admin"
                  ? "Administrator Login"
                  : page === "login"
                    ? "Login"
                    : "Create Account"}
              </h2>

              <form
                className="medicine-form"
                onSubmit={
                  page === "login" || role === "admin" ? loginUser : register
                }
              >
                {page === "register" && role !== "admin" && (
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
                          placeholder="Pharmacy license / registration number"
                          required
                          value={registration.licenseNumber}
                          onChange={e =>
                            setRegistration({
                              ...registration,
                              licenseNumber: e.target.value
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

                        <button type="button" onClick={captureLocation}>
                          📍 Capture Pharmacy GPS
                        </button>

                        {registration.latitude && (
                          <p className="location-success">
                            ✓ Pharmacy GPS captured ({registration.latitude},{" "}
                            {registration.longitude})
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
                    page === "login" || role === "admin"
                      ? login.email
                      : registration.email
                  }
                  onChange={e =>
                    page === "login" || role === "admin"
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
                    page === "login" || role === "admin"
                      ? login.password
                      : registration.password
                  }
                  onChange={e =>
                    page === "login" || role === "admin"
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
                    : page === "login" || role === "admin"
                      ? "Login"
                      : "Register"}
                </button>
              </form>

              {role !== "admin" && (
                <p>
                  {page === "login"
                    ? "Don't have an account?"
                    : "Already have an account?"}{" "}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setPage(page === "login" ? "register" : "login");
                      scrollToAuthForm();
                    }}
                  >
                    {page === "login" ? "Register" : "Login"}
                  </button>
                </p>
              )}
            </div>
          </section>

          <section className="features" id="features">
            <h2>Why Choose MediFind?</h2>
            <div className="feature-grid">
              <article className="feature-card">
                <div className="feature-icon">🔎</div>
                <h3>Live Stock Verification</h3>
                <p>
                  Search across verified local pharmacies and see real-time
                  stock quantities and transparent pricing.
                </p>
              </article>
              <article className="feature-card">
                <div className="feature-icon">📡</div>
                <h3>Smart Radius Radar</h3>
                <p>
                  Starts within 3 km and progressively expands to 5 km and 10 km
                  so you always find the closest available pharmacy.
                </p>
              </article>
              <article className="feature-card">
                <div className="feature-icon">🚚</div>
                <h3>Delivery or Store Pickup</h3>
                <p>
                  Order online with secure Razorpay checkout for doorstep
                  delivery or reserve for fast pharmacy pickup.
                </p>
              </article>
              <article className="feature-card">
                <div className="feature-icon">🩺</div>
                <h3>Pharmacist Verified</h3>
                <p>
                  Every partner pharmacy is license-verified by platform
                  administrators for genuine, safe healthcare access.
                </p>
              </article>
            </div>
          </section>
        </main>

        <footer>
          <p>© 2026 MediFind | Multi-Pharmacy Medicine Discovery & Ordering</p>
        </footer>
      </div>
    );
  }

  // ====================================================
  // AUTHENTICATED APPLICATION (CUSTOMER / PHARMACY / ADMIN)
  // ====================================================
  return (
    <div className="app">
      <nav className="navbar">
        <a
          href="#home"
          className="logo"
          onClick={e => {
            e.preventDefault();
            setSelectedPharmacyId(null);
            setActiveTab(
              user.role === "customer"
                ? "search"
                : user.role === "pharmacy"
                  ? "inventory"
                  : "admin"
            );
          }}
        >
          💊 MediFind
        </a>

        <div className="nav-links">
          {/* Notification Bell */}
          <div className="notif-wrapper">
            <button
              type="button"
              className="notif-bell-btn"
              onClick={() => {
                setShowNotifDropdown(prev => !prev);
                loadNotifications();
              }}
            >
              🔔
              {unreadNotifCount > 0 && (
                <span className="notif-badge">{unreadNotifCount}</span>
              )}
            </button>

            {showNotifDropdown && (
              <div className="notif-dropdown">
                <div className="notif-dropdown-header">
                  <strong>Notifications</strong>
                  <button type="button" onClick={markAllNotificationsRead}>
                    Mark all read
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <p className="notif-empty">No notifications yet.</p>
                ) : (
                  <div className="notif-list">
                    {notifications.slice(0, 8).map(n => (
                      <div
                        key={n._id}
                        className={`notif-item ${n.isRead ? "" : "unread"}`}
                      >
                        <strong>{n.title}</strong>
                        <p>{n.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {user.role === "customer" && (
            <button
              type="button"
              className="nav-cart-pill"
              onClick={() => {
                setSelectedPharmacyId(null);
                setActiveTab("cart");
              }}
            >
              🛒 Cart ({totalCartUnits})
            </button>
          )}

          <span>Hi, {user.name}</span>
          <button className="logout-button" onClick={logout}>
            Logout
          </button>
        </div>
      </nav>

      <main>
        <section className="hero" id="home">
          <span className="tag">
            {user.role === "customer"
              ? "CUSTOMER ACCOUNT"
              : user.role === "admin"
                ? "ADMINISTRATOR ACCOUNT"
                : "PHARMACY OWNER ACCOUNT"}
          </span>

          <h1>
            Welcome to <span>MediFind</span>
          </h1>

          {message && <div className="toast-message">{message}</div>}

          {/* CUSTOMER PERSISTENT LOCATION BAR */}
          {user.role === "customer" && (
            <LocationBar
              customerLocation={customerLocation}
              onUpdateLocation={updateCustomerLocation}
              onDetectGPS={detectCustomerGPS}
              detectingGPS={detectingGPS}
              locationPermissionError={locationPermissionError}
            />
          )}

          {/* PHARMACY OWNER VERIFICATION BANNER */}
          {user.role === "pharmacy" && pharmacy && (
            <div
              className={`verification-banner banner-${
                pharmacy.verificationStatus === "suspended"
                  ? "rejected"
                  : pharmacy.verificationStatus || "pending"
              }`}
            >
              {pharmacy.verificationStatus === "approved" && (
                <p>
                  ✅ <strong>Verified Pharmacy:</strong> Your pharmacy is
                  approved by the administrator and visible to customers in
                  medicine searches and nearby discovery.
                </p>
              )}
              {(!pharmacy.verificationStatus ||
                pharmacy.verificationStatus === "pending") && (
                <p>
                  ⏳ <strong>Pending Administrator Verification:</strong> Your
                  pharmacy is awaiting admin review. You can manage your
                  inventory now, and your medicines will appear to customers
                  once approved.
                </p>
              )}
              {pharmacy.verificationStatus === "rejected" && (
                <p>
                  ⚠️ <strong>Verification Rejected:</strong>{" "}
                  {pharmacy.rejectionReason ||
                    "Please review and update your pharmacy details."}{" "}
                  Go to <strong>Pharmacy Profile</strong> to update your details
                  and resubmit for verification.
                </p>
              )}
              {pharmacy.verificationStatus === "suspended" && (
                <p>
                  🚫 <strong>Pharmacy Suspended:</strong>{" "}
                  {pharmacy.rejectionReason ||
                    "Your pharmacy has been suspended by the platform administrator."}
                </p>
              )}
            </div>
          )}

          {/* ROLE NAVIGATION TABS */}
          {user.role !== "admin" && (
            <div className="tabs">
              {user.role === "customer" ? (
                <>
                  <button
                    className={
                      activeTab === "search" && !selectedPharmacyId
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      setSelectedPharmacyId(null);
                      setActiveTab("search");
                    }}
                  >
                    🔍 Search Medicines
                  </button>

                  <button
                    className={
                      activeTab === "nearby" && !selectedPharmacyId
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      setSelectedPharmacyId(null);
                      setActiveTab("nearby");
                    }}
                  >
                    🏥 Nearby Pharmacies
                  </button>

                  <button
                    className={
                      activeTab === "cart" && !selectedPharmacyId
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      setSelectedPharmacyId(null);
                      setActiveTab("cart");
                    }}
                  >
                    🛒 Cart ({totalCartUnits})
                  </button>

                  <button
                    className={
                      activeTab === "orders" && !selectedPharmacyId
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      setSelectedPharmacyId(null);
                      setActiveTab("orders");
                    }}
                  >
                    📦 My Orders
                  </button>

                  <button
                    className={
                      activeTab === "profile" && !selectedPharmacyId
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      setSelectedPharmacyId(null);
                      setActiveTab("profile");
                    }}
                  >
                    👤 Profile & Addresses
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={activeTab === "inventory" ? "active" : ""}
                    onClick={() => setActiveTab("inventory")}
                  >
                    📦 My Inventory
                  </button>

                  <button
                    className={activeTab === "add" ? "active" : ""}
                    onClick={() => setActiveTab("add")}
                  >
                    ➕ Add Medicine
                  </button>

                  <button
                    className={activeTab === "orders" ? "active" : ""}
                    onClick={() => setActiveTab("orders")}
                  >
                    📋 Incoming Orders
                  </button>

                  <button
                    className={activeTab === "reports" ? "active" : ""}
                    onClick={() => setActiveTab("reports")}
                  >
                    📊 Sales & Reports
                  </button>

                  <button
                    className={activeTab === "profile" ? "active" : ""}
                    onClick={() => setActiveTab("profile")}
                  >
                    🏥 Pharmacy Profile
                  </button>
                </>
              )}
            </div>
          )}

          {/* ADMINISTRATOR MODULE */}
          {user.role === "admin" && (
            <AdminDashboard apiRequest={apiRequest} notify={notify} />
          )}

          {/* DEDICATED INDIVIDUAL PHARMACY PAGE (FOR CUSTOMERS) */}
          {user.role === "customer" && selectedPharmacyId && (
            <PharmacyDetail
              pharmacyId={selectedPharmacyId}
              apiRequest={apiRequest}
              notify={notify}
              customerLocation={customerLocation}
              cart={cart}
              onAddToCart={handleAddToCart}
              onBack={() => setSelectedPharmacyId(null)}
            />
          )}

          {/* CUSTOMER TAB 1: SEARCH MEDICINES & CATEGORIES */}
          {user.role === "customer" &&
            !selectedPharmacyId &&
            activeTab === "search" && (
              <>
                {/* Medicine Category Quick Chips */}
                <div className="category-chips-row">
                  {MEDICINE_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      className={
                        selectedCategory === cat ? "pill active" : "pill"
                      }
                      onClick={() => {
                        setSelectedCategory(cat);
                        if (cat !== "All" || medicine.trim()) {
                          executeMedicineSearch({ category: cat });
                        }
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Search Input with Autocomplete Dropdown */}
                <div className="search-autocomplete-wrap">
                  <form className="search-box" onSubmit={searchMedicine}>
                    <span>🔎</span>

                    <input
                      placeholder="Enter medicine name (e.g. Dolo 650, Paracetamol)..."
                      value={medicine}
                      onFocus={() => setShowSuggestions(true)}
                      onChange={e => {
                        const val = e.target.value;
                        setMedicine(val);
                        if (!val.trim()) {
                          setSuggestions([]);
                        }
                        setShowSuggestions(true);
                      }}
                    />

                    <button type="submit" disabled={loading}>
                      {loading ? "Searching..." : "Search"}
                    </button>
                  </form>

                  {showSuggestions && suggestions.length > 0 && (
                    <div className="suggestions-dropdown">
                      {suggestions.map((sug, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="suggestion-item"
                          onClick={() => {
                            setMedicine(sug.name);
                            setShowSuggestions(false);
                            executeMedicineSearch({ queryName: sug.name });
                          }}
                        >
                          <div>
                            <strong>💊 {sug.name}</strong>{" "}
                            <small>
                              {[sug.strength, sug.formulation, sug.category]
                                .filter(Boolean)
                                .join(" • ")}
                            </small>
                          </div>
                          <span>
                            {sug.pharmacyCount}{" "}
                            {sug.pharmacyCount === 1
                              ? "pharmacy"
                              : "pharmacies"}
                            {sug.lowestPrice != null
                              ? ` • from ₹${sug.lowestPrice}`
                              : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Search Filters: Distance Radius, Sort, Max Price, Availability */}
                <div className="search-filters-bar">
                  <div className="radius-control">
                    <label>Radius:</label>
                    <select
                      value={searchRadiusKm}
                      onChange={e => {
                        setSearchRadiusKm(e.target.value);
                        if (medicine.trim() || selectedCategory !== "All") {
                          executeMedicineSearch({ radius: e.target.value });
                        }
                      }}
                    >
                      <option value="3">Smart 3 km (Auto-Expand)</option>
                      <option value="5">Within 5 km</option>
                      <option value="10">Within 10 km</option>
                      <option value="25">Within 25 km</option>
                      <option value="all">All Verified Distances</option>
                    </select>
                  </div>

                  <div className="radius-control">
                    <label>Sort By:</label>
                    <select
                      value={sortBy}
                      onChange={e => {
                        setSortBy(e.target.value);
                        if (medicine.trim() || selectedCategory !== "All") {
                          executeMedicineSearch({ sort: e.target.value });
                        }
                      }}
                    >
                      <option value="distance">Nearest Distance</option>
                      <option value="price_asc">Price: Low to High</option>
                      <option value="price_desc">Price: High to Low</option>
                      <option value="name">Medicine Name (A–Z)</option>
                    </select>
                  </div>

                  <div className="radius-control">
                    <label>Max Price (₹):</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Any"
                      className="compact-price-input"
                      value={maxPriceFilter}
                      onChange={e => setMaxPriceFilter(e.target.value)}
                    />
                  </div>

                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={includeOutOfStock}
                      onChange={e => {
                        setIncludeOutOfStock(e.target.checked);
                        if (medicine.trim() || selectedCategory !== "All") {
                          executeMedicineSearch({
                            outOfStock: e.target.checked
                          });
                        }
                      }}
                    />
                    Include Out-of-Stock
                  </label>

                  {results.length > 0 && (
                    <button
                      type="button"
                      className="pill"
                      onClick={() => setShowSearchMap(prev => !prev)}
                    >
                      {showSearchMap ? "🗺️ Hide Map" : "🗺️ Show Map"}
                    </button>
                  )}
                </div>

                {searchRadiusMeta?.wasExpanded && (
                  <div className="radius-expansion-banner">
                    <span>
                      📡 Expanded search from{" "}
                      <strong>{searchRadiusMeta.initialRadiusKm} km</strong> to{" "}
                      <strong>{searchRadiusMeta.appliedRadiusKm} km</strong> to
                      find nearby pharmacies with this medicine in stock.
                    </span>
                  </div>
                )}

                {showSearchMap && results.length > 0 && (
                  <div style={{ maxWidth: "1150px", margin: "20px auto" }}>
                    <InteractiveMap
                      userLocation={customerLocation}
                      pharmacies={results.map(r => ({
                        ...r.pharmacy,
                        distance: r.distance
                      }))}
                      onSelectPharmacy={id => setSelectedPharmacyId(id)}
                    />
                  </div>
                )}

                <div className="results-grid">
                  {results.map(item => {
                    const inStock = item.available && item.quantity > 0;
                    return (
                      <article className="medicine-card" key={item._id}>
                        <div className="admin-card-header">
                          <div>
                            <h3>{item.name}</h3>
                            <p className="med-meta-line">
                              {[
                                item.strength,
                                item.formulation,
                                item.category
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            </p>
                          </div>
                          <span
                            className={`status-badge ${
                              inStock ? "status-approved" : "status-rejected"
                            }`}
                          >
                            {inStock
                              ? `In Stock (${item.quantity})`
                              : "Out of Stock"}
                          </span>
                        </div>

                        {item.distance != null && (
                          <p className="distance-info">
                            📍{" "}
                            {item.distance < 1
                              ? `${(item.distance * 1000).toFixed(0)} metres away`
                              : `${item.distance.toFixed(2)} km away`}
                            {results.findIndex(
                              result => result.distance != null
                            ) === results.indexOf(item) && (
                              <strong> • Nearest</strong>
                            )}
                          </p>
                        )}

                        <p>
                          <strong>Pharmacy:</strong>{" "}
                          {item.pharmacy?.pharmacyName}
                        </p>

                        <p>
                          <strong>Address:</strong> {item.pharmacy?.address}
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
                          {item.price == null ? (
                            "Not listed"
                          ) : (
                            <span className="price-highlight">
                              ₹{item.price}
                            </span>
                          )}
                        </p>

                        {item.requiresPrescription && (
                          <p className="rx-badge">🩺 Prescription Required</p>
                        )}

                        <p className="last-updated">
                          🕒 Last stock update:{" "}
                          {item.lastUpdated
                            ? new Date(item.lastUpdated).toLocaleString(
                                "en-IN",
                                {
                                  dateStyle: "medium",
                                  timeStyle: "short"
                                }
                              )
                            : "Not available"}
                        </p>

                        <div className="card-actions pharmacy-card-actions">
                          {inStock && item.price != null && (
                            <button
                              type="button"
                              onClick={() =>
                                handleAddToCart(item, item.pharmacy)
                              }
                            >
                              🛒 Add to Cart
                            </button>
                          )}

                          {item.pharmacy?._id && (
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() =>
                                setSelectedPharmacyId(item.pharmacy._id)
                              }
                            >
                              🏥 View Pharmacy
                            </button>
                          )}

                          {item.pharmacy?.phone && (
                            <a
                              className="call-link-btn"
                              href={`tel:${item.pharmacy.phone}`}
                            >
                              📞 Call
                            </a>
                          )}

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
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}

          {/* CUSTOMER TAB 2: NEARBY PHARMACIES */}
          {user.role === "customer" &&
            !selectedPharmacyId &&
            activeTab === "nearby" && (
              <NearbyPharmacies
                apiRequest={apiRequest}
                notify={notify}
                customerLocation={customerLocation}
                onSelectPharmacy={id => setSelectedPharmacyId(id)}
              />
            )}

          {/* CUSTOMER TAB 3: SHOPPING CART & CHECKOUT */}
          {user.role === "customer" &&
            !selectedPharmacyId &&
            activeTab === "cart" && (
              <CartCheckout
                cart={cart}
                user={user}
                apiRequest={apiRequest}
                notify={notify}
                onUpdateCartQty={handleUpdateCartQty}
                onRemoveCartItem={handleRemoveCartItem}
                onClearCart={handleClearCart}
                onOpenPharmacy={id => setSelectedPharmacyId(id)}
                onOrderSuccess={() => setActiveTab("orders")}
              />
            )}

          {/* CUSTOMER TAB 4 & 5: ORDERS & PROFILE */}
          {user.role === "customer" &&
            !selectedPharmacyId &&
            (activeTab === "orders" || activeTab === "profile") && (
              <CustomerPortal
                activeView={activeTab}
                user={user}
                apiRequest={apiRequest}
                notify={notify}
                onUpdateUser={updatedUser => {
                  setUser(updatedUser);
                  localStorage.setItem(
                    "medifindUser",
                    JSON.stringify(updatedUser)
                  );
                }}
              />
            )}

          {/* PHARMACY OWNER: ADD MEDICINE */}
          {activeTab === "add" && user.role === "pharmacy" && (
            <section className="form-section">
              <h2>Add Medicine to Inventory</h2>
              <p>{pharmacy?.pharmacyName || "Your Pharmacy"}</p>

              <form className="medicine-form" onSubmit={addMedicine}>
                <input
                  placeholder="Medicine name (e.g., Dolo 650)"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />

                <div className="coordinate-row">
                  <input
                    placeholder="Strength (e.g., 650 mg)"
                    value={form.strength}
                    onChange={e =>
                      setForm({ ...form, strength: e.target.value })
                    }
                  />
                  <select
                    value={form.formulation}
                    onChange={e =>
                      setForm({ ...form, formulation: e.target.value })
                    }
                  >
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Injection">Injection</option>
                    <option value="Ointment">Ointment</option>
                    <option value="Drops">Drops</option>
                    <option value="Inhaler">Inhaler</option>
                  </select>
                </div>

                <div className="coordinate-row">
                  <select
                    value={form.category}
                    onChange={e =>
                      setForm({ ...form, category: e.target.value })
                    }
                  >
                    {MEDICINE_CATEGORIES.filter(c => c !== "All").map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>

                  <input
                    placeholder="Manufacturer (optional)"
                    value={form.manufacturer}
                    onChange={e =>
                      setForm({ ...form, manufacturer: e.target.value })
                    }
                  />
                </div>

                <div className="coordinate-row">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Available quantity *"
                    required
                    value={form.quantity}
                    onChange={e =>
                      setForm({ ...form, quantity: e.target.value })
                    }
                  />

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Price in ₹ (required for online orders)"
                    value={form.price}
                    onChange={e => setForm({ ...form, price: e.target.value })}
                  />
                </div>

                <input
                  placeholder="Short description / usage instructions (optional)"
                  value={form.description}
                  onChange={e =>
                    setForm({ ...form, description: e.target.value })
                  }
                />

                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={form.requiresPrescription}
                    onChange={e =>
                      setForm({
                        ...form,
                        requiresPrescription: e.target.checked
                      })
                    }
                  />
                  🩺 Requires Doctor&apos;s Prescription (Rx)
                </label>

                <button type="submit">Add Medicine</button>
              </form>
            </section>
          )}

          {/* PHARMACY OWNER: MY INVENTORY */}
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
                    {
                      inventory.filter(
                        item => item.available && item.quantity > 0
                      ).length
                    }
                  </h3>
                  <p>Available Medicines</p>
                </article>
              </div>

              <div className="results-grid">
                {inventory.map(item => (
                  <article className="medicine-card" key={item._id}>
                    <div className="admin-card-header">
                      <div>
                        <h3>{item.name}</h3>
                        <p className="med-meta-line">
                          {[item.strength, item.formulation, item.category]
                            .filter(Boolean)
                            .join(" • ")}
                        </p>
                      </div>
                      <span
                        className={`status-badge ${
                          item.available && item.quantity > 0
                            ? "status-approved"
                            : "status-rejected"
                        }`}
                      >
                        {item.available && item.quantity > 0
                          ? "Available"
                          : "Unavailable"}
                      </span>
                    </div>

                    <p>
                      <strong>Quantity:</strong> {item.quantity}
                    </p>

                    <p>
                      <strong>Price:</strong>{" "}
                      {item.price == null ? "Not listed" : `₹${item.price}`}
                    </p>

                    {item.requiresPrescription && (
                      <p className="rx-badge">🩺 Prescription Required (Rx)</p>
                    )}

                    <div className="card-actions">
                      <button onClick={() => updateStock(item)}>
                        Update Stock
                      </button>

                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() =>
                          setEditingMedicine({
                            ...item,
                            price: item.price ?? ""
                          })
                        }
                      >
                        Edit Details
                      </button>

                      <button
                        type="button"
                        className="pending-btn"
                        onClick={() => toggleMedicineAvailability(item)}
                      >
                        {item.available ? "Mark Unavailable" : "Mark Available"}
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

              {/* EDIT MEDICINE MODAL */}
              {editingMedicine && (
                <div
                  className="modal-backdrop"
                  onClick={() => setEditingMedicine(null)}
                >
                  <div
                    className="modal-card"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="modal-header">
                      <h3>Edit Medicine: {editingMedicine.name}</h3>
                      <button
                        type="button"
                        className="modal-close"
                        onClick={() => setEditingMedicine(null)}
                      >
                        ✕
                      </button>
                    </div>

                    <form
                      className="medicine-form"
                      style={{ boxShadow: "none", border: "none", padding: 0 }}
                      onSubmit={handleSaveMedicineEdit}
                    >
                      <label>Medicine Name</label>
                      <input
                        required
                        value={editingMedicine.name}
                        onChange={e =>
                          setEditingMedicine({
                            ...editingMedicine,
                            name: e.target.value
                          })
                        }
                      />

                      <div className="coordinate-row">
                        <div>
                          <label>Strength</label>
                          <input
                            placeholder="e.g. 650 mg"
                            value={editingMedicine.strength || ""}
                            onChange={e =>
                              setEditingMedicine({
                                ...editingMedicine,
                                strength: e.target.value
                              })
                            }
                          />
                        </div>
                        <div>
                          <label>Formulation</label>
                          <select
                            value={editingMedicine.formulation || "Tablet"}
                            onChange={e =>
                              setEditingMedicine({
                                ...editingMedicine,
                                formulation: e.target.value
                              })
                            }
                          >
                            <option value="Tablet">Tablet</option>
                            <option value="Capsule">Capsule</option>
                            <option value="Syrup">Syrup</option>
                            <option value="Injection">Injection</option>
                            <option value="Ointment">Ointment</option>
                            <option value="Drops">Drops</option>
                            <option value="Inhaler">Inhaler</option>
                          </select>
                        </div>
                      </div>

                      <div className="coordinate-row">
                        <div>
                          <label>Quantity</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            required
                            value={editingMedicine.quantity}
                            onChange={e =>
                              setEditingMedicine({
                                ...editingMedicine,
                                quantity: e.target.value
                              })
                            }
                          />
                        </div>
                        <div>
                          <label>Price (₹)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editingMedicine.price}
                            onChange={e =>
                              setEditingMedicine({
                                ...editingMedicine,
                                price: e.target.value
                              })
                            }
                          />
                        </div>
                      </div>

                      <label>Category</label>
                      <select
                        value={editingMedicine.category || "General"}
                        onChange={e =>
                          setEditingMedicine({
                            ...editingMedicine,
                            category: e.target.value
                          })
                        }
                      >
                        {MEDICINE_CATEGORIES.filter(c => c !== "All").map(
                          cat => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          )
                        )}
                      </select>

                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={Boolean(
                            editingMedicine.requiresPrescription
                          )}
                          onChange={e =>
                            setEditingMedicine({
                              ...editingMedicine,
                              requiresPrescription: e.target.checked
                            })
                          }
                        />
                        🩺 Requires Prescription (Rx)
                      </label>

                      <div className="profile-form-actions">
                        <button type="submit">Save Changes</button>
                        <button
                          type="button"
                          className="cancel-button"
                          onClick={() => setEditingMedicine(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* PHARMACY OWNER: ORDERS & REPORTS */}
          {user.role === "pharmacy" &&
            (activeTab === "orders" || activeTab === "reports") && (
              <PharmacyOwnerPortal
                activeTab={activeTab}
                apiRequest={apiRequest}
                notify={notify}
              />
            )}

          {/* PHARMACY OWNER: PROFILE MANAGEMENT */}
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
                      <div className="pharmacy-avatar avatar-placeholder">
                        🏥
                      </div>
                    )}
                    <p className="profile-image-caption">
                      Pharmacy profile image
                    </p>
                  </div>

                  {!editingProfile ? (
                    <div className="profile-details">
                      <p>
                        <strong>Name:</strong> {pharmacy.pharmacyName}
                      </p>
                      <p>
                        <strong>Verification Status:</strong>{" "}
                        <span
                          className={`status-badge status-${
                            pharmacy.verificationStatus || "pending"
                          }`}
                        >
                          {pharmacy.verificationStatus === "approved"
                            ? "Approved"
                            : pharmacy.verificationStatus === "rejected"
                              ? "Rejected"
                              : pharmacy.verificationStatus === "suspended"
                                ? "Suspended"
                                : "Pending Review"}
                        </span>
                      </p>
                      <p>
                        <strong>License Number:</strong>{" "}
                        {pharmacy.licenseNumber || "Not provided"}
                      </p>
                      <p>
                        <strong>Address:</strong> {pharmacy.address}
                      </p>
                      <p>
                        <strong>Phone:</strong>{" "}
                        {pharmacy.phone || "Not provided"}
                      </p>
                      <p>
                        <strong>Opening Time:</strong>{" "}
                        {pharmacy.openingTime || "Not set"}
                      </p>
                      <p>
                        <strong>Closing Time:</strong>{" "}
                        {pharmacy.closingTime || "Not set"}
                      </p>
                      <p>
                        <strong>Home Delivery:</strong>{" "}
                        {pharmacy.deliveryAvailable !== false
                          ? `Enabled (₹${pharmacy.deliveryFee ?? 30} fee)`
                          : "Disabled (Pickup Only)"}
                      </p>
                      <p>
                        <strong>GPS:</strong>{" "}
                        {pharmacy.latitude != null && pharmacy.longitude != null
                          ? `${pharmacy.latitude}, ${pharmacy.longitude}`
                          : "Not added"}
                      </p>
                      <button
                        type="button"
                        className="primary-action profile-edit-button"
                        onClick={() => setEditingProfile(true)}
                      >
                        Edit Profile
                      </button>
                    </div>
                  ) : (
                    <form
                      className="medicine-form profile-edit-form"
                      onSubmit={savePharmacyProfile}
                    >
                      <label>Pharmacy Name</label>
                      <input
                        value={profileForm.pharmacyName}
                        required
                        onChange={e =>
                          setProfileForm({
                            ...profileForm,
                            pharmacyName: e.target.value
                          })
                        }
                      />

                      <label>License / Registration Number</label>
                      <input
                        value={profileForm.licenseNumber}
                        placeholder="Enter pharmacy license number"
                        onChange={e =>
                          setProfileForm({
                            ...profileForm,
                            licenseNumber: e.target.value
                          })
                        }
                      />

                      <label>Full Address</label>
                      <textarea
                        value={profileForm.address}
                        required
                        rows="3"
                        onChange={e =>
                          setProfileForm({
                            ...profileForm,
                            address: e.target.value
                          })
                        }
                      />

                      <label>Phone Number</label>
                      <input
                        value={profileForm.phone}
                        onChange={e =>
                          setProfileForm({
                            ...profileForm,
                            phone: e.target.value
                          })
                        }
                      />

                      <div className="coordinate-row">
                        <div>
                          <label>Opening Time</label>
                          <input
                            type="time"
                            value={profileForm.openingTime}
                            onChange={e =>
                              setProfileForm({
                                ...profileForm,
                                openingTime: e.target.value
                              })
                            }
                          />
                        </div>
                        <div>
                          <label>Closing Time</label>
                          <input
                            type="time"
                            value={profileForm.closingTime}
                            onChange={e =>
                              setProfileForm({
                                ...profileForm,
                                closingTime: e.target.value
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="coordinate-row">
                        <label className="checkbox-inline">
                          <input
                            type="checkbox"
                            checked={profileForm.deliveryAvailable}
                            onChange={e =>
                              setProfileForm({
                                ...profileForm,
                                deliveryAvailable: e.target.checked
                              })
                            }
                          />
                          Offer Home Delivery
                        </label>
                        <div>
                          <label>Delivery Fee (₹)</label>
                          <input
                            type="number"
                            min="0"
                            value={profileForm.deliveryFee}
                            onChange={e =>
                              setProfileForm({
                                ...profileForm,
                                deliveryFee: e.target.value
                              })
                            }
                          />
                        </div>
                      </div>

                      <label>Pharmacy GPS Coordinates</label>
                      <div className="coordinate-row">
                        <input
                          type="number"
                          step="any"
                          placeholder="Latitude"
                          value={profileForm.latitude}
                          onChange={e =>
                            setProfileForm({
                              ...profileForm,
                              latitude: e.target.value
                            })
                          }
                        />
                        <input
                          type="number"
                          step="any"
                          placeholder="Longitude"
                          value={profileForm.longitude}
                          onChange={e =>
                            setProfileForm({
                              ...profileForm,
                              longitude: e.target.value
                            })
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="location-button"
                        onClick={captureProfileLocation}
                      >
                        📍 Update GPS Location
                      </button>

                      <InteractiveMap
                        pharmacies={[
                          {
                            pharmacyName: profileForm.pharmacyName,
                            latitude: profileForm.latitude,
                            longitude: profileForm.longitude
                          }
                        ]}
                        onPickCoordinates={({ latitude, longitude }) => {
                          setProfileForm(prev => ({
                            ...prev,
                            latitude: String(latitude),
                            longitude: String(longitude)
                          }));
                          notify("Coordinates selected from map.");
                        }}
                        height="220px"
                      />

                      <label>Change Pharmacy Profile Image</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProfileImage}
                      />
                      <p className="profile-image-caption">
                        Image format: JPG, PNG or WEBP. Maximum 2 MB.
                      </p>

                      <div className="profile-form-actions">
                        <button type="submit" disabled={profileSaving}>
                          {profileSaving
                            ? "Saving..."
                            : pharmacy.verificationStatus === "rejected"
                              ? "Save & Resubmit for Verification"
                              : "Save Profile"}
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
        <p>© 2026 MediFind | Medicine Availability & Ordering Platform</p>
        <p>Availability is pharmacy-reported. Confirm before visiting.</p>
      </footer>
    </div>
  );
}

export default App;
