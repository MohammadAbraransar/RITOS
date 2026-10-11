# Local Development & Testing Guide (`test_local.md`)

Welcome! This guide is written step-by-step for a fresher or new team member to run the entire **RITOS** platform and the **ShopFlow eCommerce Demo** locally from scratch.

---

## ⚡ Super Fast Option: One-Click `.bat` Launch (Zero Confusion!)

If you want to run everything with **1 single click**:
1. Simply double-click **`start_all.bat`** in the repository root.
   - It will automatically launch 4 labeled terminal windows (1 for each service).
   - After 5 seconds, it will automatically open both web portals in your default browser:
     - RITOS Desk Portal: [http://localhost:5173](http://localhost:5173)
     - ShopFlow Demo Store: [http://localhost:3000](http://localhost:3000)
2. To stop all services cleanly without port errors, double-click **`stop_all.bat`**.

---

## 🏗️ Architecture & Port Map

You will run **4 separate terminals** so you can view real-time logs for all services:

| Terminal | Service | Technology | Working Directory | Local URL |
| :--- | :--- | :--- | :--- | :--- |
| **Terminal 1** | **RITOS Frontend** (Desk Portal) | React + Vite + TypeScript | `f:\RITOS\frontend` | [http://localhost:5173](http://localhost:5173) |
| **Terminal 2** | **RITOS Backend** (Decision Engine) | Python FastAPI + SQLite | `f:\RITOS\backend` | [http://localhost:8000](http://localhost:8000) |
| **Terminal 3** | **ShopFlow Frontend** (eCommerce Store) | Next.js 14 + TailwindCSS | `f:\RITOS\shopflow` | [http://localhost:3000](http://localhost:3000) |
| **Terminal 4** | **ShopFlow Backend** (Dedicated API) | Node.js Standalone Microservice | `f:\RITOS\shopflow` | [http://localhost:3001](http://localhost:3001) |

```
  [ShopFlow Storefront]          [ShopFlow Backend API]
     (Port 3000)                    (Port 3001)
          │                              │
          │ (POST /api/create-test-claim)│ (Context & Callbacks)
          ▼                              ▼
  ═══════════════════════════════════════════════════════
                 [RITOS FastAPI Backend]
                       (Port 8000)
                 8-Specialist Agent Pipeline
                 Deterministic 3-Desk Triage
  ═══════════════════════════════════════════════════════
                         ▲
                         │ (REST API & WebSockets)
                         │
                 [RITOS Desk Portal UI]
                       (Port 5173)
```

---

## ⚙️ Initial One-Time Setup (Before Opening Terminals)

If this is your first time setting up the repository on your machine, perform these 3 one-time installation steps:

### 1. Python Virtual Environment & Backend Packages
Open PowerShell in `f:\RITOS`:
```powershell
# Create virtual environment if it does not exist
python -m venv .venv

# Activate environment and install dependencies
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r backend\requirements.txt

# Run database migration and seed initial data
python backend\migrate_db.py
python -m backend.app.seed
```

### 2. Install RITOS Frontend Packages
```powershell
cd frontend
npm install
cd ..
```

### 3. Install ShopFlow Packages
```powershell
cd shopflow
npm install
cd ..
```

---

## 🚀 Running the 4 Terminals

Open 4 separate terminal windows or tabs (e.g. in VS Code or Windows Terminal).

---

### 💻 Terminal 1: RITOS Frontend (Desk Portal)
This runs the operations portal where human agents manage tickets, review exceptions, and view audit events.

```powershell
cd f:\RITOS\frontend
npm run dev
```

- **Status:** Running on [http://localhost:5173](http://localhost:5173)
- **What to look for in terminal:** `VITE v5.x.x  ready in ... ms ➜ Local: http://localhost:5173/`

---

### 💻 Terminal 2: RITOS Backend (API & Multi-Agent Engine)
This runs the FastAPI core that adjudicates refund claims, enforces product policies, and manages desks.

```powershell
cd f:\RITOS\backend
& "..\.venv\Scripts\Activate.ps1"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

- **Status:** Running on [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **What to look for in terminal:** `INFO: Application startup complete. Uvicorn running on http://0.0.0.0:8000`

---

### 💻 Terminal 3: ShopFlow Frontend (eCommerce Demo Store)
This runs the dummy eCommerce storefront where customers place orders and submit refund claims.

```powershell
cd f:\RITOS\shopflow
npm run dev -- -p 3000
```

- **Status:** Running on [http://localhost:3000](http://localhost:3000)
- **What to look for in terminal:** `Ready in ... ms ➜ Local: http://localhost:3000`

---

### 💻 Terminal 4: ShopFlow Backend (API & Callback Server)
This runs the dedicated ShopFlow backend that feeds customer history context to RITOS and receives decision callbacks.

```powershell
cd f:\RITOS\shopflow
node standalone-backend.js
```

- **Status:** Running on [http://localhost:3001](http://localhost:3001)
- **Health check:** [http://localhost:3001/api/health](http://localhost:3001/api/health)
- **What to look for in terminal:** `[ShopFlow Standalone API] Running at http://localhost:3001`

---

## 🧪 End-to-End Testing Walkthrough

Follow these steps to verify that the complete end-to-end flow works:

### Step 1: Log in to RITOS Desk Portal
1. Open your browser and navigate to **[http://localhost:5173](http://localhost:5173)**.
2. Log in using any of the seeded demo accounts:
   - **Administrator:** `admin@ritos.local` / `ChangeMe123!`
   - **Support Agent:** `agent@ritos.local` / `ChangeMe123!`
   - **Refund Specialist:** `refunds@ritos.local` / `ChangeMe123!`
3. You will see the live RITOS operations dashboard with the 3 Decision Desks:
   - **CS-1:** Fast-Track Auto-Approved Refunds
   - **CS-2:** Human Review & Proof Needed
   - **CS-3:** Hard Non-Refundable Rejections

---

### Step 2: Open ShopFlow Store & Raise Refund Claims
1. Open a new browser tab and navigate to **[http://localhost:3000](http://localhost:3000)**.
2. In the **"My Recent Orders"** section, click **"⚡ Raise Refund Ticket"** on the demo order cards:

| Card | Order ID | Product Item | Expected Desk | Why? |
| :--- | :--- | :--- | :--- | :--- |
| **Order #1** | `ORD-88201` | Executive Laptop Sleeve | **CS-1 (Auto-Approved)** | Verified defective item within the 14-day policy window. |
| **Order #2** | `ORD-88202` | Wireless ANC Headphones | **CS-2 (More Proof Needed)** | High-value item requiring photo proof / serial check. |
| **Order #3** | `ORD-88203` | RGB Gaming Keyboard | **CS-3 (Rejected)** | Return window expired (26 days elapsed, 14-day max). |

3. Click **"Submit Claim to RITOS"** in the modal.
4. You will instantly see the live response badge showing:
   - The ticket ID (e.g. `sf_tkt_...`)
   - The assigned desk (`CS_1`, `CS_2`, or `CS_3`)
   - The deterministic policy evaluation reason.

---

### Step 3: Test the Composite Duplicate Key Logic
RITOS prevents duplicate claims based on **BOTH** `order_id` / `transaction_id` **AND** the purchased `item_name`:

1. Find the **Multi-Item Order (`ORD-88204`)** on the ShopFlow page.
2. **Action 1:** Raise a refund for **Item #1: Precision Stylus Pen Pro**.
   - Result: Lands in **CS-1 (Approved)** as a valid first claim.
3. **Action 2:** Raise a refund for **Item #2: MagSafe Wireless Stand** (same order `ORD-88204`!).
   - Result: **NOT** marked as a duplicate! It evaluates on its own merits and lands in **CS-1 (Approved)** because the product model is different.
4. **Action 3:** Raise a refund for **Item #1: Precision Stylus Pen Pro** AGAIN (same order `ORD-88204` + same model name!).
   - Result: **Immediately detected as a duplicate claim!**
   - Automatically routed to **CS-3 (NON_REFUNDABLE)** with policy reason:
     > *"Duplicate claim rejected: An active or resolved claim (#...) already exists for this exact product item/model in order/transaction."*

---

### Step 4: Verify in RITOS Desk Portal
1. Switch back to your [RITOS Portal tab](http://localhost:5173).
2. Go to **Desks** or **Tickets**.
3. Locate the tickets you just raised from ShopFlow.
4. Click on any ticket to view:
   - **Financial Verification:** Transaction ID check against ledger.
   - **Assigned Desk:** CS-1, CS-2, or CS-3.
   - **8-Agent Pipeline Trace:** Triage classification, risk signals, and auto-generated customer message draft.
   - **Audit Events:** Immutable timeline of actions.

---

## 🛠️ Handy Troubleshooting & FAQ

### 1. "Port already in use" Error?
- If port `8000`, `5173`, `3000`, or `3001` is blocked by an old background process on Windows, find and kill it:
  ```powershell
  # Find PID using port 8000 (replace with 3000, 3001, or 5173 as needed)
  Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force
  ```

### 2. How do I reset or re-seed the RITOS database?
```powershell
cd f:\RITOS\backend
python migrate_db.py
python -m app.seed
```

### 3. What are the shared secrets / API keys?
- **RITOS Webhook Bearer Key:** `Bearer ritos_dev_key_secret_2026`
- **Default Seed Password:** `ChangeMe123!`
