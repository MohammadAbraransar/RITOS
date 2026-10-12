# Local Development & Testing Guide (`test_local.md`)

Welcome! This guide is written step-by-step for any developer, fresher, or team member to run the entire **RITOS** platform and the **ShopFlow eCommerce Demo** locally from scratch.

---

## ⚡ One Terminal: `pnpm dev` (Recommended)

After `setup.bat` has been run once, start everything from the repository root:

```powershell
pnpm install   # first time only (installs the launcher)
pnpm dev       # opens the split view below
```

```
 links               │  RITOS + ShopFlow  3/3 running
 api                 │  ● RITOS Desk Portal     http://localhost:5173
 desk                │  ● RITOS API (Swagger)   http://localhost:8000/docs
 shop                │  ● ShopFlow Store        http://localhost:3000
```

The left list holds the services and the right pane shows the selected one's live logs. `links` is a live status page with every URL and the demo logins.

| Key | Action |
| :--- | :--- |
| `↑` / `↓` | Pick a service |
| `Ctrl+A` | Switch focus between the list and the log (scroll with the mouse) |
| `r` / `x` / `s` | Restart / stop / start the selected service |
| `Ctrl+C` (or `q`) | Stop every service and exit, wherever the focus is |

| Command | What it runs |
| :--- | :--- |
| `pnpm dev` | Split view with all three services |
| `pnpm dev:plain` | All services in one combined, prefixed log stream (no split view) |
| `pnpm dev:api` / `pnpm dev:desk` / `pnpm dev:shop` | One service only |
| `pnpm stop` | Frees ports 5173, 8000, 3000, 3001 if anything was left behind |

---

## ⚡ One-Click Batch Files (separate windows)

Everything has been configured with Windows batch files in the repository root for zero confusion:

| Batch File | What it does | When to run |
| :--- | :--- | :--- |
| **`setup.bat`** | Automatically installs Python packages, sets up `.venv`, initializes SQLite DB, and runs `npm install` for both frontends. | Run **once** when you first clone the project on a new machine. |
| **`start_all.bat`** | Launches all 3 services in labeled terminal windows and automatically opens the browser tabs. | Run every time you want to start development or test locally. |
| **`stop_all.bat`** | Kills all background processes on ports `5173`, `8000`, `3000`, and `3001` cleanly. | Run whenever you want to shut down or reload all services. |

---

## 🏗️ Architecture & Port Map

When running, the system operates across **3 services** sharing one Supabase Postgres database (`shopflow` and `ritos` schemas):

| Terminal | Service | Technology | Working Directory | Local URL |
| :--- | :--- | :--- | :--- | :--- |
| **Terminal 1** | **RITOS Frontend** (Desk Portal) | React + Vite + TypeScript | `frontend/` | [http://localhost:5173](http://localhost:5173) |
| **Terminal 2** | **RITOS Backend** (Multi-Agent Engine) | Python FastAPI + SQLite | `backend/` | [http://localhost:8000](http://localhost:8000) |
| **Terminal 3** | **ShopFlow Frontend** (eCommerce Store) | Next.js 14 + TailwindCSS | `shopflow/` | [http://localhost:3000](http://localhost:3000) |

```
 ShopFlow store (:3000)  ── outbox event: refund.ticket.created ──►  RITOS API (:8000)
   customers, orders,     ◄── GET /api/ritos/refund-tickets/{id}/context ──   orchestrator
   payments, policies         (store is the source of truth)                  8 agents -> decision gate
                          ◄── outbox: STATUS / NOTIFICATION / DECISION ──     AUTO_APPROVE | AUTO_REJECT
   executes the refund    ── outbox: refund.execution.completed ──►           AWAIT_PROOF | AWAIT_APPROVAL
                                                                               (human resumes in desk portal)
                                         RITOS Desk Portal (:5173)
```

---

## 🗄️ Database: Supabase (one project, two schemas)

1. Create a free project at supabase.com and note the database password.
2. Open **Connect** in the Supabase dashboard and copy the **Transaction pooler** (port 6543) and **Session pooler** (port 5432) connection strings.
3. `shopflow/.env` (copied from `shopflow/.env.example`):
   - `DATABASE_URL` = transaction pooler string + `?pgbouncer=true&schema=shopflow`
   - `DIRECT_URL` = session pooler string + `?schema=shopflow`
4. `backend/.env`:
   - `DATABASE_URL` = session pooler string (no query string)
   - `DB_SCHEMA=ritos`
5. `RITOS_API_KEY` must be identical in `backend/.env` and `shopflow/.env`.
6. Run `setup.bat` again: it creates the ShopFlow tables and seed data. RITOS creates its own tables on first start.

Adding real customer data later: insert customers, products/policies and orders into the `shopflow` schema (Prisma seed script or Supabase table editor). RITOS reads every claim's facts from the store, so no RITOS change is needed.

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

### 3. Install ShopFlow Dependencies and Database
```powershell
cd shopflow
npm install
copy .env.example .env   # then paste your Supabase URLs
npx prisma db push
npm run db:seed
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

### Step 2b: Full Store Flow (real database, recommended)
1. Log in to ShopFlow as a seeded customer, e.g. `ananya@example.com` / `Demo@1234` (store admin: `admin@shopflow.test` / `Demo@1234`).
2. Raise a refund from **My Orders** on a delivered order.
3. Within ~5 seconds the store outbox sends the event to RITOS, which:
   - **Auto-approves** (CS-1, verified, low risk, ≤ `AUTO_APPROVE_MAX_INR`): the store executes the mock refund and the ticket reaches `REFUNDED`.
   - **Auto-rejects** (CS-3, e.g. outside the return window): the store ticket becomes `REJECTED`.
   - **Waits for a human** (CS-2 proof needed, or high value): the store shows `PROCESSING` and the shopper gets a notification. In the RITOS portal, CS-2 accepts the proof (moves to CS-1), then CS-1 or Finance approves, and the decision is sent to the store.
4. Inspect any ticket's runs, per-agent steps and outbound calls at `GET /api/v1/tickets/{id}/workflow` (Swagger: http://localhost:8000/docs).

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
To stop all services at once, double-click **`stop_all.bat`** or run:
```powershell
.\stop_all.bat
```
