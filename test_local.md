# Local Development & Testing Guide (`test_local.md`)

How to run **RITOS** and the **ShopFlow** demo store locally. Everything runs from the repository root with `pnpm`.

Prerequisites: Node.js 20+, pnpm, Python 3.11+.

---

## 🚀 Quick Start

```powershell
pnpm install      # root launcher tools (first time)
pnpm bootstrap    # Python venv, all packages, .env files, database migrations (first time, safe to repeat)
pnpm dev          # start everything
```

---

## ⚡ `pnpm dev`

```
 links               │  RITOS + ShopFlow  3/3 running
 api                 │  ● RITOS Desk Portal     http://localhost:5173
 desk                │  ● RITOS API (Swagger)   http://localhost:8000/docs
 shop                │  ● ShopFlow Store        http://localhost:3000
 shop-fallback       │
```

The left list holds the services and the right pane shows the selected one's live logs. `links` is a live status page with every URL and the demo logins.

| Key | Action |
| :--- | :--- |
| `↑` / `↓` | Pick a service |
| `Ctrl+A` | Switch focus between the list and the log (scroll with the mouse) |
| `r` / `x` / `s` | Restart / stop / start the selected service |
| `Ctrl+C` (or `q`) | Stop every service and exit, wherever the focus is |

---

## 🧰 All Commands

| Command | What it does |
| :--- | :--- |
| `pnpm bootstrap` | Full setup: Python venv + packages, npm packages, `.env` files, migrations, demo data if the store is empty |
| `pnpm dev` | Split view with all services |
| `pnpm dev:plain` | All services in one combined, prefixed log stream |
| `pnpm dev:api` / `pnpm dev:desk` / `pnpm dev:shop` | One service only |
| `pnpm db:migrate` | Apply pending database migrations (RITOS Alembic + ShopFlow Prisma) without reinstalling packages |
| `pnpm db:seed` | **Reset both demo databases**: ShopFlow store data and RITOS ticket history (RITOS user accounts are kept) |
| `pnpm stop` | Free ports 5173, 8000, 3000 if anything was left behind |

> Ports come from `scripts/dev/ports.mjs` (override with `DESK_PORT`, `API_PORT`, `SHOP_PORT`). The API runs without auto-reload by default for stability; set `API_RELOAD=true` to restart it on code changes.

---

## 🏗️ Architecture & Port Map

| Service | Technology | Directory | URL |
| :--- | :--- | :--- | :--- |
| **RITOS Desk Portal** | React + Vite + TypeScript | `frontend/` | [http://localhost:5173](http://localhost:5173) |
| **RITOS API** (orchestrator + 9 agents) | Python FastAPI | `backend/` | [http://localhost:8000/docs](http://localhost:8000/docs) |
| **ShopFlow Store** | Next.js 14 + Prisma | `shopflow/` | [http://localhost:3000](http://localhost:3000) |

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

## 🗄️ Database: Supabase

One Supabase project (region ap-northeast-2) holds both apps in separate Postgres schemas:

| Schema | Owner | Migrations |
| :--- | :--- | :--- |
| `ritos` | RITOS API (SQLAlchemy) | Alembic: `backend/migrations/versions/` |
| `shopflow` | ShopFlow store (Prisma) | Prisma: `shopflow/prisma/migrations/` |

Connection settings live in `backend/.env` and `shopflow/.env` (both git-ignored; ask the team for them, or copy the `.env.example` files and fill in the Supabase **Connect** strings):

- `backend/.env`: `DATABASE_URL` = session pooler (port 5432), `DB_SCHEMA=ritos`
- `shopflow/.env`: `DATABASE_URL` = transaction pooler (port 6543) + `?pgbouncer=true&schema=shopflow`, `DIRECT_URL` = session pooler + `?schema=shopflow`
- `RITOS_API_KEY` must be identical in both files.
- A `@` in the database password must be written as `%40` in the URLs.

Changing the schema:
- **RITOS:** edit `backend/app/models.py`, then `cd backend` and `..\.venv\Scripts\python -m alembic revision --autogenerate -m "describe change"`, review the file, then `pnpm db:migrate`.
- **ShopFlow:** edit `shopflow/prisma/schema.prisma`, then `cd shopflow` and `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<timestamp>_<name>/migration.sql`, review it, then `pnpm db:migrate`.

Performance note: the project runs in Seoul (ap-northeast-2); each query from India takes about 145 ms, so one claim takes roughly 5–7 s from store to decision. Right after `pnpm db:seed`, the store first sends its ~12 historical demo tickets to RITOS, so a new claim can take a minute or two to be decided.

Adding real customer data later: insert customers, products/policies and orders into the `shopflow` schema (Supabase table editor or a script). RITOS reads every claim's facts from the store, so no RITOS change is needed. Do not run `pnpm db:seed` after that: it resets the store.

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
Press `Ctrl+C` in the `pnpm dev` window. If a port is still busy afterwards, run:
```powershell
pnpm stop
```
