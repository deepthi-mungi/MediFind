# MediFind — Multi-Pharmacy Medicine Discovery & Ordering Platform

MediFind is a full-stack healthcare platform connecting customers with verified local pharmacies for real-time medicine availability discovery, dynamic progressive-radius pharmacy search, prescription verification, and online ordering via Home Delivery or Pharmacy Pickup.

---

## 1. Architecture & Technology Stack

- **Frontend (`client/`)**: React 19, Vite 8, Leaflet + OpenStreetMap Interactive Maps, Razorpay Checkout SDK
- **Backend (`server/`)**: Node.js, Express 5, JWT Authentication, Role-Based Access Control (`customer`, `pharmacy`, `admin`), Sliding-Window Rate Limiting
- **Database**: MongoDB / MongoDB Atlas with Mongoose 9 & `2dsphere` Geospatial Indexing

---

## 2. Environment Variables (`server/.env`)

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/medifind
JWT_SECRET=your_long_random_secret_key
ADMIN_EMAIL=admin@medifind.com
ADMIN_PASSWORD=Admin@1234
# Leave empty to use built-in Razorpay Sandbox Testing Mode, or set live/test Razorpay credentials:
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
CORS_ORIGIN=*
```

---

## 3. Running Locally

### Start Backend Server
```bash
cd server
npm install
npm run dev
```
The backend runs at `http://localhost:5000`.

### Start Frontend Application
```bash
cd client
npm install
npm run dev
```
The frontend runs at `http://localhost:5173`.

---

## 4. Production Deployment Instructions

1. **Database (MongoDB Atlas)**:
   - Create a MongoDB Atlas cluster, whitelist your server IP, and set `MONGO_URI` in `server/.env` to your `mongodb+srv://...` connection string.
   - Geospatial `2dsphere` indexes on `Pharmacy.location` and compound indexes on `Medicine`, `Order`, and `Payment` are created automatically on startup.
2. **Backend Deployment (Render / Railway / AWS / DigitalOcean)**:
   - Set environment variables: `PORT`, `MONGO_URI`, `JWT_SECRET` (strong random 64-char secret), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `CORS_ORIGIN` (your frontend domain).
   - Start command: `npm start` (`node server.js`).
3. **Frontend Deployment (Vercel / Netlify / Cloudflare Pages)**:
   - Update `API_URL` in `client/src/App.jsx` to point to your deployed backend URL.
   - Build command: `npm run build` (outputs static bundle to `client/dist/`).
