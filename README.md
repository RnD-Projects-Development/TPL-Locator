## CityTag Tracking Dashboard (Prototype)

Web dashboard that logs into the CityTag GPS tracking service, lists user devices, and shows the latest known location on a Mapbox map.

### Tech
- **Frontend**: React 18 (Vite), React Router v6, Tailwind CSS, Mapbox GL JS
- **Backend**: Python 3.11+, FastAPI, Motor (MongoDB), PyJWT, python-dotenv, pycryptodome
- **Encryption**: TripleDES ECB + PKCS7 (token as key)

---

## Prerequisites
- Node.js 18+
- Python 3.11+
- MongoDB running locally (or Atlas URI)
- A Mapbox access token

---

## Setup

### 1) Backend

From project root:

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

Edit `backend/.env`:
- **MONGO_URI**: your Mongo connection string (default points to local)
- **CITYTAG_BASE_URL**: keep as `http://citytag.yuminstall.top`
- **JWT_SECRET_KEY**: set any random string

Optional: seed demo users into MongoDB (upsert-safe):

```bash
python seed_users.py
```

Run:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir .
```

Health check:
- `http://127.0.0.1:8000/health`

### 2) Frontend

From project root:

```bash
cd frontend
npm install
```

Edit `frontend/.env`:
- **VITE_API_BASE_URL**: `http://127.0.0.1:8000`
- **VITE_MAPBOX_TOKEN**: your Mapbox token

Run:

```bash
npm run dev
```

Open:
- `http://localhost:5173`

---

## How it works

### Login flow
- Frontend calls **POST** `/api/login` with `{ email, password, uid }`
- Backend logs into CityTag (`/api/interface/login`) and stores:
  - user record in MongoDB (`users` collection)
  - cached CityTag `token` on the user
- Backend returns a **JWT access token** (sent by frontend as `Authorization: Bearer ...`)

### Devices
- Frontend calls **GET** `/api/devices`
- Backend calls CityTag device list endpoint:
  - `POST /api2/v4/device/{uid}`
  - body: `{ "encryption": "<3DES-ECB-PKCS7(base64)>" }`
  - decrypts response `data` and returns the list

### Bind device API
- **POST** `/api/devices` binds a device to a user.
- **PUT** `/api/devices/{sn}` updates a device for both admins and users by checking the authenticated role.

Request body fields:
- `sn` (required): device serial number
- `email` (optional): target user email, mainly for admin use
- `user_id` (optional): target user id, mainly for admin use
- `name` (optional): label saved on the device when binding
- `client` (optional): client/company name saved on the device when binding
- `category` (optional): device category such as `car`, `bag`, or `wallet`
- `region` (optional, admin only): region label for the device
- `zone` (optional, admin only): legacy single-zone field
- `add_zone` (optional, admin only): add a fence zone id to the device
- `remove_zone` (optional, admin only): remove a fence zone id from the device

Example:

```json
{
  "sn": "TPL-000123",
  "user_id": "66f0c2b3e2b8c9b12a345678",
  "name": "Delivery Locator 1",
  "client": "TPL Logistics",
  "category": "car"
}
```

Notes:
- Regular users only need `sn`, `name`, `client`, and `category`.
- Admins should send either `user_id` or `email` to bind a device to a specific user.
- Regular users can update only `name`, `client`, and `category` through the PUT endpoint.
- Admins can update `name`, `client`, `region`, `category`, `zone`, `add_zone`, and `remove_zone` through the same PUT endpoint.

### Latest location
- Frontend calls **GET** `/api/location/{sn}` (auto-refresh every 45s)
- Backend calls trajectory endpoint:
  - `POST /api/interface/v2/device/{uid}`
  - decrypts response `data`
  - returns only the **last** item from `history`

---

## Notes / Troubleshooting
- If CityTag rejects requests, re-login (token may be invalid/expired).
- If the map is blank, ensure `VITE_MAPBOX_TOKEN` is set and valid.

