# Local Development & Testing Guide (`test_local.md`)

Welcome! This guide is written step-by-step for any developer, fresher, or team member to run the entire **RITOS** platform and the **ShopFlow eCommerce Demo** locally from scratch.

---

## ⚡ One-Click Batch Files (Recommended)

Everything has been configured with Windows batch files in the repository root for zero confusion:

| Batch File | What it does | When to run |
| :--- | :--- | :--- |
| **`setup.bat`** | Automatically installs Python packages, sets up `.venv`, initializes SQLite DB, and runs `npm install` for both frontends. | Run **once** when you first clone the project on a new machine. |
| **`start_all.bat`** | Launches all 4 services in labeled terminal windows and automatically opens the browser tabs. | Run every time you want to start development or test locally. |
| **`stop_all.bat`** | Kills all background processes on ports `5173`, `8000`, `3000`, and `3001` cleanly. | Run whenever you want to shut down or reload all services. |

---

## 🏗️ Architecture & Port Map

When running, the system operates across **4 services**:

| Terminal | Service | Technology | Working Directory | Local URL |
| :--- | :--- | :--- | :--- | :--- |
| **Terminal 1** | **RITOS Frontend** (Desk Portal) | React + Vite + TypeScript | `frontend/` | [http://localhost:5173](http://localhost:5173) |
| **Terminal 2** | **RITOS Backend** (Multi-Agent Engine) | Python FastAPI + SQLite | `backend/` | [http://localhost:8000](http://localhost:8000) |
| **Terminal 3** | **ShopFlow Frontend** (eCommerce Store) | Next.js 14 + TailwindCSS | `shopflow/` | [http://localhost:3000](http://localhost:3000) |
| **Terminal 4** | **ShopFlow Backend** (Dedicated API) | Node.js Standalone Microservice | `shopflow/` | [http://localhost:3001](http://localhost:3001) |

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

## ⚙️ Initial Setup (If Not Using `setup.bat`)

If you prefer to configure manually in PowerShell instead of double-clicking `setup.bat`:

### 1. Python Virtual Environment & Backend
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r backend\requirements.txt
python backend\migrate_db.py
python -m backend.app.seed
```

### 2. Install RITOS Frontend
```powershell
cd frontend
npm install
cd ..
```

### 3. Install ShopFlow Dependencies
```powershell
cd shopflow
npm install
cd ..
```

---

## 🚀 Running the 4 Terminals Manually

If you want to run each service in its own terminal manually:

### 💻 Terminal 1: RITOS Frontend (Desk Portal)
```powershell
cd frontend
npm run dev
```
- **Local URL:** [http://localhost:5173](http://localhost:5173)

### 💻 Terminal 2: RITOS Backend (API & 8-Agent Pipeline)
```powershell
cd backend
..\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- **Local URL:** [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

### 💻 Terminal 3: ShopFlow Frontend (eCommerce Store)
```powershell
cd shopflow
npm run dev -- -p 3000
```
- **Local URL:** [http://localhost:3000](http://localhost:3000)

### 💻 Terminal 4: ShopFlow Backend (API & Context Adapter)
```powershell
cd shopflow
node standalone-backend.js
```
- **Local URL:** [http://localhost:3001](http://localhost:3001)
- **Health Check:** [http://localhost:3001/api/health](http://localhost:3001/api/health)

---

## 🧪 End-to-End Testing & Verification

### Step 1: Log in to RITOS Desk Portal
1. Open [http://localhost:5173](http://localhost:5173).
2. Log in with:
   - **Email:** `admin@ritos.local` (or `agent@ritos.local` / `refunds@ritos.local`)
   - **Password:** `ChangeMe123!`
3. You will see the live RITOS operations dashboard with the 3 Decision Desks:
   - **CS-1:** Fast-Track Auto-Approved Refunds
   - **CS-2:** Human Review & Proof Needed
   - **CS-3:** Hard Non-Refundable Rejections

---

### Step 2: Open ShopFlow & Submit Claims
1. Open [http://localhost:3000](http://localhost:3000).
2. Scroll to **"My Recent Orders"** and click **"⚡ Raise Refund Ticket"**:

| Order ID | Product Item | Expected Desk | Reason |
| :--- | :--- | :--- | :--- |
| `ORD-88201` | Executive Laptop Sleeve | **CS-1 (Approved)** | Verified payment within 14-day policy window. |
| `ORD-88202` | Wireless ANC Headphones | **CS-2 (Proof Needed)** | Electronics return requiring serial check / photo proof. |
| `ORD-88203` | RGB Gaming Keyboard | **CS-3 (Rejected)** | Window expired (26 days elapsed, 14-day policy max). |

---

### Step 3: Strict 3-Point Duplicate Verification
RITOS strictly requires that **all three criteria** match simultaneously before marking a ticket as a duplicate:
1. `transaction_id` matches
2. `order_id` matches
3. `item_name` matches (purchased product model)

#### Verification Scenarios:
- **Same Order & Transaction, but Different Item** (e.g. `Precision Stylus Pen Pro` vs `MagSafe Wireless Stand` in order `ORD-88204`):
  - **Result:** **NOT a duplicate!** Evaluates on its own merits as a distinct product claim.
- **Same Order, Same Transaction, and Same Item** submitted a second time:
  - **Result:** **Immediately flagged as a Duplicate!**
  - **Desk:** Routed to **CS-3 (NON_REFUNDABLE)**
  - **Policy Reason:** *"Duplicate claim rejected: An active or resolved claim (#...) already exists with identical transaction ID, order ID, and product model."*

---

### Step 4: Verification of 8 Specialist Agents
When a ticket is created, RITOS executes an 8-agent pipeline:
1. **Agent 1 (Transaction Data Fetcher):** Verifies transaction ID against payment gateway/ledger.
2. **Agent 2 (Duplicate Intelligence):** Strict 3-point composite check (`transaction_id` + `order_id` + `item_name`).
3. **Agent 3 (Issue Classification):** NLP classification & sentiment analysis.
4. **Agent 4 (Risk & Fraud Signals):** Multi-factor velocity and return history scoring.
5. **Agent 5 (Refund Eligibility & Policy):** Deterministic desk routing (`CS-1`, `CS-2`, `CS-3`).
6. **Agent 6 (Routing & SLA):** Assigns team queue, priority (`P1`-`P4`), and SLA window.
7. **Agent 7 (Visual Evidence Adapter):** Extracts and inspects customer image proofs.
8. **Agent 8 (Reconciliation & Communication):** Drafts personalized customer messages and writes immutable audit logs.

All 8 agents' telemetry traces can be inspected directly in the RITOS UI under the ticket details modal.

---

## 🛑 Clean Shutdown
To stop all 4 services at once, double-click **`stop_all.bat`** or run:
```powershell
.\stop_all.bat
```
