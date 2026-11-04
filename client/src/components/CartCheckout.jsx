import { useEffect, useState, useCallback } from "react";

function CartCheckout({
  cart,
  user,
  apiRequest,
  notify,
  onUpdateCartQty,
  onRemoveCartItem,
  onClearCart,
  onOrderSuccess,
  onOpenPharmacy
}) {
  const [fulfillmentType, setFulfillmentType] = useState("delivery");
  const [customerPhone, setCustomerPhone] = useState(user?.phone || "");
  const [customerNotes, setCustomerNotes] = useState("");

  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState({
    recipientName: user?.name || "",
    phone: user?.phone || "",
    street: user?.address || "",
    area: "",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500001",
    landmark: ""
  });

  const [prescriptionData, setPrescriptionData] = useState({
    patientName: user?.name || "",
    doctorName: "",
    notes: "",
    fileData: "",
    fileName: ""
  });

  const [placingOrder, setPlacingOrder] = useState(false);
  const [paymentSession, setPaymentSession] = useState(null);
  const [sandboxMethod, setSandboxMethod] = useState("upi");
  const [sandboxUpiId, setSandboxUpiId] = useState("customer@okaxis");
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  const loadAddresses = useCallback(async () => {
    try {
      const list = await apiRequest("/api/auth/addresses");
      if (Array.isArray(list) && list.length > 0) {
        setSavedAddresses(list);
        const def = list.find(a => a.isDefault) || list[0];
        setSelectedAddressId(def._id);
        setDeliveryAddress({
          recipientName: def.recipientName || user?.name || "",
          phone: def.phone || user?.phone || "",
          street: def.street || "",
          area: def.area || "",
          city: def.city || "",
          state: def.state || "",
          pincode: def.pincode || "",
          landmark: def.landmark || ""
        });
      }
    } catch {
      // Ignore if none saved yet
    }
  }, [apiRequest, user?.name, user?.phone]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  useEffect(() => {
    if (cart.pharmacy && cart.pharmacy.deliveryAvailable === false) {
      setFulfillmentType("pickup");
    }
  }, [cart.pharmacy]);

  const itemsTotal = cart.items.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * item.quantity,
    0
  );
  const deliveryFee =
    fulfillmentType === "delivery" && cart.items.length > 0
      ? Number(cart.pharmacy?.deliveryFee ?? 30)
      : 0;
  const grandTotal = Number((itemsTotal + deliveryFee).toFixed(2));
  const requiresPrescription = cart.items.some(item => item.requiresPrescription);

  function handleSelectSavedAddress(addrId) {
    setSelectedAddressId(addrId);
    const found = savedAddresses.find(a => a._id === addrId);
    if (found) {
      setDeliveryAddress({
        recipientName: found.recipientName || user?.name || "",
        phone: found.phone || user?.phone || "",
        street: found.street || "",
        area: found.area || "",
        city: found.city || "",
        state: found.state || "",
        pincode: found.pincode || "",
        landmark: found.landmark || ""
      });
    }
  }

  function handlePrescriptionFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      !file.type.startsWith("image/") &&
      file.type !== "application/pdf"
    ) {
      notify("Please upload an image (JPG, PNG, WEBP) or PDF prescription.");
      e.target.value = "";
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      notify("Prescription file must be smaller than 3 MB.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPrescriptionData(prev => ({
        ...prev,
        fileData: reader.result,
        fileName: file.name
      }));
      notify("Prescription attached successfully.");
    };
    reader.readAsDataURL(file);
  }

  async function handleCheckoutSubmit(e) {
    e.preventDefault();
    if (!cart.items.length || !cart.pharmacy) {
      notify("Your cart is empty.");
      return;
    }

    if (requiresPrescription && !prescriptionData.fileData) {
      notify("Please upload a valid medical prescription for Rx items.");
      return;
    }

    setPlacingOrder(true);
    try {
      // 1. Create order on server (validates stock & reserves quantities atomically)
      const orderRes = await apiRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          pharmacyId: cart.pharmacy._id,
          items: cart.items.map(i => ({
            medicineId: i.medicineId,
            name: i.name,
            quantity: i.quantity
          })),
          fulfillmentType,
          deliveryAddress: fulfillmentType === "delivery" ? deliveryAddress : {},
          customerPhone,
          customerNotes,
          prescriptionData: requiresPrescription ? prescriptionData : null
        })
      });

      const createdOrder = orderRes.order;

      // 2. Initialize payment order on server
      const paymentInit = await apiRequest("/api/payments/create-order", {
        method: "POST",
        body: JSON.stringify({ orderId: createdOrder._id })
      });

      // If live Razorpay keys are configured and Razorpay SDK is available, launch Razorpay Checkout
      if (paymentInit.mode === "razorpay" && window.Razorpay) {
        const rzp = new window.Razorpay({
          key: paymentInit.keyId,
          amount: paymentInit.amountInPaise,
          currency: paymentInit.currency,
          name: "MediFind",
          description: `Order ${paymentInit.orderNumber} at ${paymentInit.pharmacyName}`,
          order_id: paymentInit.gatewayOrderId,
          prefill: {
            name: user?.name || "",
            email: user?.email || "",
            contact: customerPhone
          },
          theme: { color: "#087e65" },
          handler: async response => {
            await verifyServerPayment({
              orderId: createdOrder._id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              method: "razorpay"
            });
          }
        });
        rzp.open();
      } else {
        // Open built-in Razorpay Sandbox Checkout Modal
        setPaymentSession(paymentInit);
      }
    } catch (error) {
      notify(error.message || "Checkout failed.");
    } finally {
      setPlacingOrder(false);
    }
  }

  async function handleSandboxPaymentComplete(e) {
    e.preventDefault();
    if (!paymentSession) return;
    setVerifyingPayment(true);
    try {
      // Request server-signed test authorization token
      const signed = await apiRequest("/api/payments/sandbox-authorize", {
        method: "POST",
        body: JSON.stringify({
          gatewayOrderId: paymentSession.gatewayOrderId,
          method: sandboxMethod
        })
      });

      // Verify HMAC SHA-256 signature on server
      await verifyServerPayment({
        orderId: paymentSession.orderId,
        razorpay_order_id: signed.razorpay_order_id,
        razorpay_payment_id: signed.razorpay_payment_id,
        razorpay_signature: signed.razorpay_signature,
        method: sandboxMethod
      });
    } catch (error) {
      notify(error.message || "Payment verification failed.");
    } finally {
      setVerifyingPayment(false);
    }
  }

  async function verifyServerPayment(verificationPayload) {
    const verified = await apiRequest("/api/payments/verify", {
      method: "POST",
      body: JSON.stringify(verificationPayload)
    });

    notify(verified.message || "Payment verified and order confirmed!");
    setPaymentSession(null);
    onClearCart();
    onOrderSuccess(verified.order);
  }

  if (!cart.items.length) {
    return (
      <section className="dashboard">
        <h2>🛒 Your MediFind Cart</h2>
        <div className="admin-empty">
          <p>Your cart is currently empty.</p>
          <p style={{ marginTop: "8px", fontSize: "14px" }}>
            Search for medicines or browse a nearby pharmacy to add items to your
            cart.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard checkout-section">
      <h2>🛒 Checkout & Fulfillment</h2>

      <div className="checkout-grid">
        {/* LEFT COLUMN: CART ITEMS & PRESCRIPTION */}
        <div className="checkout-cart-column">
          <div className="cart-pharmacy-banner">
            <div>
              <span className="loc-caption">Ordering From Verified Pharmacy</span>
              <h3>🏥 {cart.pharmacy?.pharmacyName}</h3>
              <p>{cart.pharmacy?.address}</p>
            </div>
            <div className="cart-banner-actions">
              {cart.pharmacy?._id && (
                <button
                  type="button"
                  className="pill"
                  onClick={() => onOpenPharmacy(cart.pharmacy._id)}
                >
                  + Add More Items
                </button>
              )}
              <button
                type="button"
                className="pill danger-pill"
                onClick={onClearCart}
              >
                Clear Cart
              </button>
            </div>
          </div>

          <div className="cart-items-list">
            {cart.items.map(item => (
              <div className="cart-item-row" key={item.medicineId}>
                <div className="cart-item-info">
                  <h4>
                    {item.name}{" "}
                    {item.requiresPrescription && (
                      <span className="rx-pill">Rx</span>
                    )}
                  </h4>
                  <p>
                    {[item.strength, item.formulation]
                      .filter(Boolean)
                      .join(" • ")}{" "}
                    • ₹{item.price} each (Max available: {item.maxStock})
                  </p>
                </div>

                <div className="cart-qty-controls">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateCartQty(item.medicineId, item.quantity - 1)
                    }
                  >
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    disabled={item.quantity >= item.maxStock}
                    onClick={() =>
                      onUpdateCartQty(item.medicineId, item.quantity + 1)
                    }
                  >
                    +
                  </button>
                </div>

                <div className="cart-item-subtotal">
                  <strong>₹{(item.price * item.quantity).toFixed(2)}</strong>
                  <button
                    type="button"
                    className="remove-item-btn"
                    onClick={() => onRemoveCartItem(item.medicineId)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* PRESCRIPTION UPLOAD SECTION WHEN REQUIRED */}
          {requiresPrescription && (
            <div className="prescription-upload-card">
              <h3>🩺 Medical Prescription Required</h3>
              <p>
                Your cart includes prescription-regulated medicine(s). Please
                upload a valid doctor&apos;s prescription. The pharmacist will
                verify it before dispensing.
              </p>

              <div className="prescription-fields">
                <input
                  placeholder="Patient Full Name *"
                  required
                  value={prescriptionData.patientName}
                  onChange={e =>
                    setPrescriptionData({
                      ...prescriptionData,
                      patientName: e.target.value
                    })
                  }
                />
                <input
                  placeholder="Prescribing Doctor Name (optional)"
                  value={prescriptionData.doctorName}
                  onChange={e =>
                    setPrescriptionData({
                      ...prescriptionData,
                      doctorName: e.target.value
                    })
                  }
                />
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handlePrescriptionFile}
                />
                {prescriptionData.fileName && (
                  <p className="location-success">
                    ✓ Attached: {prescriptionData.fileName}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: FULFILLMENT & PAYMENT SUMMARY */}
        <form className="medicine-form checkout-form-card" onSubmit={handleCheckoutSubmit}>
          <h3>Fulfillment Method</h3>

          <div className="fulfillment-toggle">
            <button
              type="button"
              disabled={cart.pharmacy?.deliveryAvailable === false}
              className={
                fulfillmentType === "delivery"
                  ? "fulfill-btn active"
                  : "fulfill-btn"
              }
              onClick={() => setFulfillmentType("delivery")}
            >
              🚚 Home Delivery (₹{cart.pharmacy?.deliveryFee ?? 30})
            </button>
            <button
              type="button"
              className={
                fulfillmentType === "pickup"
                  ? "fulfill-btn active"
                  : "fulfill-btn"
              }
              onClick={() => setFulfillmentType("pickup")}
            >
              🏪 Pharmacy Pickup (Free)
            </button>
          </div>

          <label>Contact Phone Number *</label>
          <input
            required
            placeholder="10-digit mobile number"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
          />

          {fulfillmentType === "delivery" ? (
            <div className="delivery-address-fields">
              {savedAddresses.length > 0 && (
                <>
                  <label>Choose Saved Address</label>
                  <select
                    value={selectedAddressId}
                    onChange={e => handleSelectSavedAddress(e.target.value)}
                  >
                    {savedAddresses.map(addr => (
                      <option key={addr._id} value={addr._id}>
                        {addr.label}: {addr.street}, {addr.city} ({addr.pincode})
                      </option>
                    ))}
                  </select>
                </>
              )}

              <label>Recipient Name *</label>
              <input
                required
                placeholder="Recipient Name"
                value={deliveryAddress.recipientName}
                onChange={e =>
                  setDeliveryAddress({
                    ...deliveryAddress,
                    recipientName: e.target.value
                  })
                }
              />

              <label>House / Flat / Street Address *</label>
              <input
                required
                placeholder="Street address"
                value={deliveryAddress.street}
                onChange={e =>
                  setDeliveryAddress({
                    ...deliveryAddress,
                    street: e.target.value
                  })
                }
              />

              <div className="coordinate-row">
                <div>
                  <label>City *</label>
                  <input
                    required
                    placeholder="City"
                    value={deliveryAddress.city}
                    onChange={e =>
                      setDeliveryAddress({
                        ...deliveryAddress,
                        city: e.target.value
                      })
                    }
                  />
                </div>
                <div>
                  <label>Pincode *</label>
                  <input
                    required
                    placeholder="Pincode"
                    value={deliveryAddress.pincode}
                    onChange={e =>
                      setDeliveryAddress({
                        ...deliveryAddress,
                        pincode: e.target.value
                      })
                    }
                  />
                </div>
              </div>

              <label>Landmark (optional)</label>
              <input
                placeholder="Nearby landmark"
                value={deliveryAddress.landmark}
                onChange={e =>
                  setDeliveryAddress({
                    ...deliveryAddress,
                    landmark: e.target.value
                  })
                }
              />
            </div>
          ) : (
            <div className="pickup-info-box">
              <strong>🏪 Pickup Location:</strong>
              <p>{cart.pharmacy?.pharmacyName}</p>
              <p>{cart.pharmacy?.address}</p>
              {cart.pharmacy?.openingTime && cart.pharmacy?.closingTime && (
                <p>
                  Hours: {cart.pharmacy.openingTime} –{" "}
                  {cart.pharmacy.closingTime}
                </p>
              )}
            </div>
          )}

          <label>Order Notes (optional)</label>
          <input
            placeholder="Special instructions for pharmacist or delivery..."
            value={customerNotes}
            onChange={e => setCustomerNotes(e.target.value)}
          />

          <div className="price-summary-box">
            <div className="summary-row">
              <span>Items Subtotal ({cart.items.length} items)</span>
              <span>₹{itemsTotal.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>
                {fulfillmentType === "delivery"
                  ? "Home Delivery Fee"
                  : "Pharmacy Pickup"}
              </span>
              <span>
                {deliveryFee === 0 ? "FREE" : `₹${deliveryFee.toFixed(2)}`}
              </span>
            </div>
            <div className="summary-row total-row">
              <strong>Total Payable</strong>
              <strong>₹{grandTotal.toFixed(2)}</strong>
            </div>
          </div>

          <button type="submit" disabled={placingOrder}>
            {placingOrder
              ? "Reserving Stock & Initializing Payment..."
              : `Proceed to Secure Payment (₹${grandTotal.toFixed(2)})`}
          </button>
        </form>
      </div>

      {/* RAZORPAY SANDBOX PAYMENT CHECKOUT MODAL */}
      {paymentSession && (
        <div className="modal-backdrop">
          <div className="modal-card payment-modal">
            <div className="payment-modal-header">
              <div>
                <span className="sandbox-badge">
                  🔒 RAZORPAY CHECKOUT ({paymentSession.mode.toUpperCase()} MODE)
                </span>
                <h3>Pay ₹{paymentSession.amount.toFixed(2)}</h3>
                <p>
                  Order <strong>{paymentSession.orderNumber}</strong> •{" "}
                  {paymentSession.pharmacyName}
                </p>
              </div>
            </div>

            <form
              className="payment-modal-body"
              onSubmit={handleSandboxPaymentComplete}
            >
              <p className="payment-gateway-id">
                Gateway Order ID: <code>{paymentSession.gatewayOrderId}</code>
              </p>

              <label>Select Payment Method</label>
              <div className="filter-pills" style={{ margin: "10px 0 16px" }}>
                <button
                  type="button"
                  className={sandboxMethod === "upi" ? "pill active" : "pill"}
                  onClick={() => setSandboxMethod("upi")}
                >
                  📱 UPI (GPay / PhonePe / Paytm)
                </button>
                <button
                  type="button"
                  className={sandboxMethod === "card" ? "pill active" : "pill"}
                  onClick={() => setSandboxMethod("card")}
                >
                  💳 Credit / Debit Card
                </button>
                <button
                  type="button"
                  className={
                    sandboxMethod === "netbanking" ? "pill active" : "pill"
                  }
                  onClick={() => setSandboxMethod("netbanking")}
                >
                  🏦 NetBanking
                </button>
              </div>

              {sandboxMethod === "upi" && (
                <input
                  required
                  placeholder="Enter UPI ID (e.g., customer@okaxis)"
                  value={sandboxUpiId}
                  onChange={e => setSandboxUpiId(e.target.value)}
                />
              )}

              {sandboxMethod === "card" && (
                <div className="sandbox-card-Note">
                  <p>
                    Sandbox Test Card: <code>4111 •••• •••• 1111</code> | Expiry:{" "}
                    <code>12/29</code> | CVV: <code>123</code>
                  </p>
                </div>
              )}

              {sandboxMethod === "netbanking" && (
                <div className="sandbox-card-Note">
                  <p>Sandbox Test Bank: State Bank of India / HDFC / ICICI</p>
                </div>
              )}

              <p className="security-note">
                🛡️ Payment is verified server-side using HMAC SHA-256 signature
                validation before marking your order as paid.
              </p>

              <div className="profile-form-actions">
                <button type="submit" disabled={verifyingPayment}>
                  {verifyingPayment
                    ? "Verifying HMAC Signature..."
                    : `Authorize & Pay ₹${paymentSession.amount.toFixed(2)}`}
                </button>
                <button
                  type="button"
                  className="cancel-button"
                  disabled={verifyingPayment}
                  onClick={() => {
                    setPaymentSession(null);
                    onClearCart();
                    notify(
                      "Payment window closed. You can view your order in My Orders."
                    );
                  }}
                >
                  Pay Later / Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default CartCheckout;
