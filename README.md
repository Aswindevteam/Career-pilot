# CareerPilot

AI-powered job-search co-pilot — auto-applies to jobs on Naukri, Shine, Hirist and LinkedIn using your real browser session, tracks every application, and helps you manage your entire job search from one dashboard.

## What's inside

```
Career-pilot/
├── backend/        Node.js + Express API (auth, jobs, applications, auto-apply worker)
├── extension/      Chrome extension (popup dashboard + content scripts)
├── docker/         Docker Compose for MongoDB
├── index.html      Web dashboard (single-page app)
├── app.js          Web dashboard logic
└── styles.css      Web dashboard styles
```

## Stack

- **Backend** — Node.js, Express, MongoDB, Playwright, JWT
- **Frontend** — Vanilla JS / HTML / CSS (no build step)
- **Extension** — Chrome Manifest V3 (service worker + content scripts)
- **Database** — MongoDB 7 via Docker
- **Automation** — Playwright (backend worker) + Chrome content scripts (extension)

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| Docker + Docker Compose | any recent | https://docs.docker.com/get-docker |
| Google Chrome | any | https://www.google.com/chrome |
| Git | any | https://git-scm.com |

---

## Local Setup & Run

### 1. Clone the repo

```bash
git clone https://github.com/Aswindevteam/Career-pilot.git
cd Career-pilot
```

### 2. Start MongoDB

```bash
cd docker
docker compose up -d
```

MongoDB runs on `localhost:27017`  
Credentials: `admin / changeme` (change in production)

### 3. Configure the backend

```bash
cd ../backend
cp .env.example .env
```

Edit `.env`:

```
PORT=4001
MONGO_URI=mongodb://admin:changeme@localhost:27017/jobagent?authSource=admin
JWT_SECRET=your-secret-key-here
```

### 4. Install backend dependencies

```bash
npm install
```

### 5. Start the backend

```bash
node server.js
```

You should see:
```
Server running on port 4001
Connected to MongoDB
```

### 6. Open the web dashboard

```bash
cd ..
npx serve . -p 8080
```

Then open **http://localhost:8080** in Chrome.

> Or open `index.html` directly in Chrome (double-click the file).

### Quick API check

```
http://localhost:4001/api/jobs      → returns []
http://localhost:4001/api/users/me  → returns 401 (needs login)
```

---

## Chrome Extension — How to Add

### Step 1 — Open Chrome Extensions page

Open Chrome and go to:
```
chrome://extensions
```

### Step 2 — Enable Developer Mode

Toggle **Developer mode** ON (top-right corner of the page).

### Step 3 — Load the extension

1. Click **"Load unpacked"**
2. Navigate to the `extension/` folder inside this project
3. Click **Select Folder**

The CareerPilot **cp** icon will appear in your Chrome toolbar.

### Step 4 — Pin the extension

Click the puzzle icon (🧩) in the Chrome toolbar → click the pin icon next to **CareerPilot Auto-Apply**.

### Step 5 — Use the extension

1. Click the **cp** icon in the toolbar
2. Sign in with your CareerPilot account
3. Go to **Profile → Portal Credentials** — add your Naukri / Shine / LinkedIn email and password
4. Go to **Dashboard** → click **▶ Start** next to any portal
5. The portal opens as a new tab in your browser — the extension logs in and applies automatically

> Click **⤢** (top-right of the popup) to open the full web dashboard.

---

## Running Everything Together

Open **two terminals**:

**Terminal 1 — Backend:**
```bash
cd Career-pilot/backend
node server.js
```

**Terminal 2 — Web dashboard:**
```bash
cd Career-pilot
npx serve . -p 8080
```

Then load the Chrome extension (see above) and open **http://localhost:8080**.

---

## Deployment

### Backend (VPS / any Linux server)

```bash
# on your server
git clone https://github.com/Aswindevteam/Career-pilot.git
cd Career-pilot/docker
docker compose up -d          # start MongoDB

cd ../backend
cp .env.example .env          # edit MONGO_URI and JWT_SECRET
npm install
npm install -g pm2
pm2 start server.js --name careerpilot-api
pm2 save
pm2 startup
```

Backend will be live at `http://YOUR_SERVER_IP:4001`

> Point a domain at it and add Nginx + SSL with Certbot for HTTPS.

### Frontend (Netlify / Vercel — free)

**Netlify:**
1. Go to https://netlify.com → **Add new site → Deploy manually**
2. Drag and drop the `Career-pilot/` folder (the one with `index.html`)
3. Done — Netlify gives you a public URL instantly

**Vercel:**
```bash
npm install -g vercel
cd Career-pilot
vercel
```

> After deploying frontend, update the `API` constant in `app.js` from `http://localhost:4001/api` to your live backend URL.

### Chrome Extension (publish to Chrome Web Store)

1. Zip the `extension/` folder:
   ```bash
   cd Career-pilot
   zip -r careerpilot-extension.zip extension/
   ```
2. Go to https://chrome.google.com/webstore/devconsole
3. Click **New item** → upload `careerpilot-extension.zip`
4. Fill in store listing details → **Submit for review**

> Review takes 1–3 business days.

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Backend port | `4001` |
| `MONGO_URI` | MongoDB connection string | `mongodb://admin:changeme@localhost:27017/jobagent?authSource=admin` |
| `JWT_SECRET` | Secret for signing tokens | — (required) |

---

## Project Status

- [x] Auth — register, login, JWT
- [x] User profile — role, skills, cities, portal credentials
- [x] Job + Application models, CRUD, Kanban tracker
- [x] Match scorer
- [x] Auto-apply — Playwright backend worker (Naukri, Shine)
- [x] Chrome extension — full popup dashboard, in-browser auto-apply
- [x] Content scripts — Naukri, Shine, Hirist, LinkedIn
- [x] Résumé upload + parse
- [x] Admin panel
- [ ] HR email finder + Gmail OAuth
- [ ] LinkedIn Easy Apply multi-step automation
- [ ] Indeed support
- [ ] Interview prep module

---

## Notes

- Portal passwords are stored as entered — add AES encryption before going to production.
- Respect each portal's Terms of Service and rate limits.
- Gmail sending must use OAuth2, not password auth.
- The Playwright worker runs headless on servers without a display (`DISPLAY` env not set).
