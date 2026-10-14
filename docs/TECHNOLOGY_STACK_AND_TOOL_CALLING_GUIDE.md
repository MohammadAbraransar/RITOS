# Technology Stack & Tool Calling Architecture Guide
## Comprehensive Technical Specification: Backend, Frontend, ShopFlow & Agent Tool Invocations

---

## 1. Monorepo Overview & Workspace Topology

RITOS is structured as a coordinated multi-tier monorepo comprising three distinct applications orchestrated by root developer tooling:

```
                            ┌──────────────────────────────────────────────┐
                            │               Root Workspace                 │
                            │  pnpm dev / start.mjs (mprocs / concurrently)│
                            └──────┬───────────────┬──────────────┬────────┘
                                   │               │              │
                   ┌───────────────┘               │              └────────────────┐
                   ▼                               ▼                               ▼
       ┌───────────────────────┐       ┌───────────────────────┐       ┌───────────────────────┐
       │   RITOS Desk Portal   │       │       RITOS API       │       │    ShopFlow Store     │
       │     (`frontend/`)     │       │     (`backend/`)      │       │     (`shopflow/`)     │
       │   React 18 + Vite 6   │       │   Python + FastAPI    │       │   Next.js 14 + Prisma │
       │     Port: 5173        │       │      Port: 8000       │       │      Port: 3000       │
       └───────────────────────┘       └───────────────────────┘       └───────────────────────┘
                   │                               ▲                               ▲
                   │                               │                               │
                   └────────── REST API ───────────┴──── Inbound Webhook / Outbox ─┘
```

---

## 2. Backend Technology Stack (`backend/`)

The RITOS backend provides refund intelligence, computer vision analysis, multi-agent orchestration, and double-entry financial accounting.

### 2.1 Core Frameworks & Runtime
- **Python 3.11+**: Core programming language utilizing strict type hinting, dataclasses, and async features.
- **FastAPI (`>=0.115, <1.0`)**: Modern, high-performance web framework for building APIs with automatic OpenAPI (Swagger) documentation generation at `/docs`.
- **Uvicorn (`>=0.30, <1.0`)**: Lightning-fast ASGI server implementation for Python.
- **Pydantic v2 (`>=2.8, <3.0`) & Pydantic-Settings (`>=2.4, <3.0`)**:
  - Request/response data validation and serialization.
  - Type-safe environment variable parsing (`backend/app/config.py`).

### 2.2 Database & Persistence Layer
- **PostgreSQL 15+ (Supabase / Render)**: Production-grade relational database hosting RITOS tables under the dedicated schema `ritos`.
- **SQLAlchemy 2.x (`>=2.0, <3.0`)**: ORM and Database Toolkit implementing repository patterns, transaction sessions, and row-level locking (`with_for_update()`).
- **Alembic (`>=1.13, <2.0`)**: Database migration tool for versioned schema tracking.
- **psycopg3 (`psycopg[binary] >=3.2, <4.0`)**: PostgreSQL database adapter for Python supporting connection pooling and binary protocols.
- **SQLite Fallback**: File-based persistence (`sqlite:///./ritos.db`) for lightweight local development without external dependencies.

### 2.3 Computer Vision & Machine Learning
- **Pillow (`>=10.0, <13.0`)**:
  - Image decoding and byte-stream inspection.
  - Image file magic-byte validation (detecting JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`).
  - Decompression-bomb mitigation (`Image.MAX_IMAGE_PIXELS`).
  - Difference hashing (`dhash`) to detect photo recycling across claims.
  - Laplacian variance sharpness calculation for blur detection.
- **OpenCLIP (`open_clip_torch`) & PyTorch (CPU/CUDA)**:
  - Zero-shot multimodal vision-language model (`ViT-B-32` / `laion2b_s34b_b79k`).
  - **Product Identity (Agent 7A)**: Cosine similarity comparison between customer-uploaded photos and merchant catalog reference images.
  - **Defect Verification (Agent 7B)**: Cross-modal prompt contest comparing probability logits of defect prompts vs. undamaged product prompts.
- **NumPy**: Matrix and vector normalization for embeddings and image statistics.

### 2.4 Authentication, Cryptography & Security
- **Python-Jose (`>=3.3, <4.0`)**: Cryptographic JSON Web Token (JWT) encoding and validation.
- **Pwdlib / Argon2 (`>=0.2, <1.0`) & Passlib / Bcrypt**: Modern memory-hard password hashing.
- **HMAC-SHA256 (`hashlib`, `hmac`)**:
  - Server-to-server webhook signature verification (`X-RITOS-Webhook-Secret`).
  - Cryptographic payload fingerprinting and idempotent key derivation (`refund_key()`).

### 2.5 Networking, Async & Outbox Messaging
- **HTTPX (`>=0.27, <1.0`)**: Next-generation HTTP client with connection pooling and configurable timeouts for fetching store context and delivering outbox callbacks.
- **Transactional Outbox Engine (`backend/app/outbox.py`)**:
  - Polling worker with lease locking (`outbox_claim_lease_seconds`).
  - Exponential backoff retry mechanism (`outbox_base_backoff_seconds`, `outbox_max_backoff_seconds`).
- **Celery + Redis (`celery[redis] >=5.4, <6.0`)**: Scaffolded asynchronous worker and queue infrastructure.

### 2.6 Testing & Code Quality
- **Pytest (`>=8.0, <9.0`)**: Test framework with fixtures for transactional isolation, trust boundaries, and workflow assertion.

---

## 3. Frontend Technology Stack (`frontend/`)

The RITOS Desk Portal is an enterprise single-page application (SPA) designed for multi-desk triage, proof inspection, and financial authorization.

### 3.1 Core Architecture & Build Tools
- **React 18 (`18.3.1`)**: Component-based UI library with hooks for state management.
- **TypeScript 5.7 (`~5.7.2`)**: Static typing across all API payloads, ticket entities, and UI components.
- **Vite 6 (`^6.0.5`)**: High-performance frontend build tool providing near-instant Hot Module Replacement (HMR).

### 3.2 Styling, Design System & Icons
- **Bespoke Enterprise Design System (`frontend/src/styles.css`)**:
  - Tailored CSS custom properties defining restrained navy/blue color tokens, crisp borders, and accessible typography.
  - White-first enterprise layout avoiding decorative clutter.
- **Lucide React (`^0.468.0`)**: Consistent, lightweight SVG icon suite.
- **Recharts (`^2.15.0`)**: Data visualization library for operational analytics and SLA metrics.

### 3.3 State Management & Networking
- **Custom API Client (`frontend/src/api.ts`)**:
  - Type-safe fetch abstraction handling authentication Bearer tokens via `localStorage`.
  - Global error handling, normalized responses, and desk-specific endpoint wrappers.
- **Role-Based Views**: Separate dashboards dynamically rendering controls for CS-1 (Fast-Track), CS-2 (Exceptions), CS-3 (Denials), Finance Approver, Supervisor, and Customer.

### 3.4 Frontend Testing
- **Vitest (`^2.1.8`) & JSDOM (`^25.0.1`)**: Blazing-fast Vite-native unit testing runner.

---

## 4. ShopFlow Technology Stack (`shopflow/`)

ShopFlow is a modern Next.js e-commerce demo storefront providing authentic customer orders, payments, return policies, and webhook integrations.

### 4.1 Framework & Runtime
- **Next.js 14 (`14.2.15`)**: Full-stack framework utilizing:
  - **App Router**: Route groups `(auth)` and `(shop)`.
  - **Route Handlers**: API endpoints for cart, checkout, orders, evidence upload, and webhooks.
  - **React Server Components (RSC)**: Server-side data fetching for products and catalog pages.
- **Node.js 20+**: Execution environment.

### 4.2 Database & Data Access Layer
- **Prisma ORM (`^5.21.1`)**: Type-safe database client and schema definitions (`shopflow/prisma/schema.prisma`).
- **PostgreSQL (Supabase)**: Database schema isolated under `shopflow`.
  - **Transaction Pooler (Port 6543)** with `pgbouncer=true` for runtime queries.
  - **Session Pooler (Port 5432)** for schema migrations and seeding.
- **Custom Schema Qualification (`src/server/db-schema.ts`)**: Enables multi-tenant co-existence in shared PostgreSQL databases.

### 4.3 Frontend & UI Components
- **Tailwind CSS (`^3.4.14`)**, **PostCSS (`^8.4.47`)**, and **Autoprefixer**: Utility-first responsive styling.
- **clsx (`^2.1.1`) & tailwind-merge (`^2.5.4`)**: Conditional class manipulation.
- **Lucide React (`^0.453.0`)**: E-commerce iconography.

### 4.4 Authentication, Validation & State
- **Zod (`^3.23.8`)**: Schema-based validation for intake payloads and API routes.
- **Bcryptjs (`^2.4.3`)**: Password hashing for store accounts.
- **Iron-Session (`^8.0.4`) & Database Sessions**: Encrypted cookie and database-backed session management.

### 4.5 Store Outbox & Event Processor
- **Transactional Outbox (`src/server/outbox/processor.ts`)**: Next.js background processor sending store events (`refund.ticket.created`, `refund.execution.completed`) to RITOS with retry backoff.
- **Next.js Instrumentation (`src/instrumentation.ts`)**: Hooks into server startup to initialize outbox dispatchers.

---

## 5. Tool Calling & Agent Function Invocation Architecture

In RITOS, **"Tool Calling"** refers to the structured invocation of specialized sub-functions, external provider adapters, data verification services, and neural models by the orchestration pipeline.

Unlike unbounded LLM agent loops, RITOS employs **Deterministic-First Tool Dispatching** with strict typed schemas. Every tool call receives a `PipelineState` and returns a validated dictionary or dataclass.

```
                           ┌───────────────────────────┐
                           │      PipelineState        │
                           │ (DB, Ticket, Evidence...) │
                           └─────────────┬─────────────┘
                                         │
                                         ▼
                      ┌─────────────────────────────────────┐
                      │    Orchestrator Tool Dispatcher     │
                      │   STEP_FUNCTIONS[agent_id](state)   │
                      └──────────────────┬──────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
┌────────────────┐              ┌────────────────┐              ┌────────────────┐
│ Database Tools │              │ Hardware / CV  │              │ External HTTP  │
│  & Adapters    │              │ Neural Models  │              │    Adapters    │
└────────────────┘              └────────────────┘              └────────────────┘
 - verify_ledger                 - PIL magic-bytes               - fetch_shopflow
 - evaluate_risk                 - Laplacian blur                 - gateway_refund
 - evaluate_policy               - OpenCLIP cosine                - outbox_enqueue
```

### 5.1 The Tool Dispatch Mechanism (`backend/app/orchestrator.py`)

The central orchestrator executes tools via a functional dispatch table:

```python
# Function Dispatch Table in backend/app/agents/__init__.py
STEP_FUNCTIONS: Dict[str, Callable[[PipelineState], dict]] = {
    "ledger_ground_truth": ledger_ground_truth,
    "logistics_verification": logistics_verification,
    "claim_analysis": claim_analysis,
    "evidence_verification": evidence_verification,
    "policy_enforcement": policy_enforcement,
    "risk_assessment": risk_assessment,
    "decision_arbiter": decision_arbiter,
    "review_coordination": review_coordination,
    "customer_communication": customer_communication,
}
```

Each tool invocation is isolated in a `try...except` wrapper:
1. **Clocking & Metrics**: Start time and duration (`duration_ms`) are recorded.
2. **Audit Logging**: Successful tool execution creates a `WorkflowStep` with `status="SUCCEEDED"`.
3. **Fail-Safe Gate**: If any tool raises an unhandled error, the step is marked `status="FAILED"`, and the ticket is immediately diverted to human exception review (`CS-2`) — **it can never fail into an automated payout**.

---

### 5.2 Specialist Tools Breakdown

#### Tool 1: Ledger Ground Truth Tool (`verify_ledger_ground_truth`)
- **File**: [`backend/app/agents/ledger_agent.py`](file:///c:/Career/NextGen%20Project/RITOS/backend/app/agents/ledger_agent.py)
- **Input Parameters**: `db: Session`, `transaction_id: str`, `customer_id: str`, `amount: Decimal`, `currency: str`
- **Actions**:
  - Queries `Transaction` entity.
  - Verifies payment status (`SUCCESSFUL`), currency match, and customer ownership.
  - Calculates net refundable balance: $Balance = \text{Amount} - \text{Refunded} - \text{Pending}$.
  - Executes composite 3-point duplicate query across open/resolved tickets.
- **Return Contract**:
  ```python
  {
      "status": "VERIFIED" | "AMOUNT_MISMATCH" | "CUSTOMER_MISMATCH" | "ALREADY_REFUNDED" | "TRANSACTION_NOT_FOUND",
      "available_balance": float,
      "pending_reservations": float,
      "findings": str
  }
  ```

#### Tool 2: Logistics Verification Tool (`verify_shipment_logistics`)
- **File**: [`backend/app/agents/logistics_agent.py`](file:///c:/Career/NextGen%20Project/RITOS/backend/app/agents/logistics_agent.py)
- **Input Parameters**: `db: Session`, `order_id: str`, `store_facts: dict`
- **Actions**: Queries carrier tracking status, delivery timestamps, and signed delivery confirmations.
- **Return Contract**:
  ```python
  {
      "tracking_number": str,
      "status": "DELIVERED" | "IN_TRANSIT" | "EXCEPTION",
      "delivered_at": str,
      "signed_delivery": bool,
      "source": "carrier_adapter" | "store_record"
  }
  ```

#### Tool 3: Claim Intent & Contradiction Tools
- **File**: [`backend/app/agents/claim_reason_agent.py`](file:///c:/Career/NextGen%20Project/RITOS/backend/app/agents/claim_reason_agent.py) & [`backend/app/services.py`](file:///c:/Career/NextGen%20Project/RITOS/backend/app/services.py)
- **Tools**:
  - `classify(text)`: Pattern/keyword NLP matching customer complaints to standard operational categories.
  - `classify_claim_reason(description, selected_reason)`: Normalizes claim into controlled dispute taxonomy.
  - `analyze_contradictions(...)`: Cross-checks claimed reason against logistics and product category (e.g., non-delivery claim vs. signed delivery record).
- **Return Contract**:
  ```python
  {
      "controlled_reason": str,
      "matched_terms": List[str],
      "contradictions": List[str]
  }
  ```

#### Tool 4: Visual Evidence & Neural Vision Tools
- **Files**: [`backend/app/proof_reader.py`](file:///c:/Career/NextGen%20Project/RITOS/backend/app/proof_reader.py) & [`backend/app/vision.py`](file:///c:/Career/NextGen%20Project/RITOS/backend/app/vision.py)
- **Tools**:
  - `validate_image_file_signature(raw_bytes)`: Binary magic-byte analysis.
  - `load_image_bytes(raw_bytes)`: Structural sanity checks and decompression-bomb protection.
  - `ClipVisionProvider.assess(images, product, claimed_defect, reference_images)`:
    - Zero-shot image embedding cosine comparison ($Photos \cdot Refs^T$).
    - Zero-shot prompt contest ($Photos \cdot Texts^T$) evaluating defect prompt share vs. intact prompt share.
- **Return Contract**:
  ```python
  {
      "identity_status": "verified" | "mismatch" | "inconclusive",
      "defect_status": "verified" | "mismatch" | "inconclusive",
      "raw_scores": {
          "identity_similarity": float,
          "defect_prompt_share": float,
          "thresholds": dict
      },
      "model_version": "open_clip/ViT-B-32/laion2b_s34b_b79k"
  }
  ```

#### Tool 5: Policy Enforcement Tool (`evaluate_policy_eligibility`)
- **File**: [`backend/app/agents/policy_agent.py`](file:///c:/Career/NextGen%20Project/RITOS/backend/app/agents/policy_agent.py)
- **Input Parameters**: `policy: dict`, `purchase_date: datetime`, `store_facts: dict`, `defect_verified: bool`, `defect_claimed: bool`
- **Actions**: Evaluates category return window (UTC calculations) and applies statutory/merchant defect exceptions.
- **Return Contract**:
  ```python
  {
      "eligible": bool | None,
      "reason_code": "POLICY_WITHIN_WINDOW" | "POLICY_WINDOW_EXPIRED" | "POLICY_DEFECT_EXCEPTION",
      "days_elapsed": int,
      "rule_version": str
  }
  ```

#### Tool 6: Customer Risk & Velocity Tool (`evaluate_customer_risk`)
- **File**: [`backend/app/agents/risk_agent.py`](file:///c:/Career/NextGen%20Project/RITOS/backend/app/agents/risk_agent.py)
- **Input Parameters**: `db: Session`, `customer_id: str`, `ticket_id: str`, `amount: Decimal`, `category: str`, `store_facts: dict`
- **Actions**: Evaluates 30/90/365-day claim frequencies, refund-to-spend ratios, and high-value supervisor flags.
- **Return Contract**:
  ```python
  {
      "risk_score": int,
      "risk_tier": "LOW" | "MEDIUM" | "HIGH",
      "risk_signals": List[dict],
      "requires_supervisory_review": bool
  }
  ```

#### Tool 7: Decision Arbiter Tool (`arbitrate`)
- **File**: [`backend/app/agents/decision_agent.py`](file:///c:/Career/NextGen%20Project/RITOS/backend/app/agents/decision_agent.py)
- **Input Parameters**: Strongly typed `DecisionInputs` dataclass containing findings from all previous tools.
- **Actions**: Applies fixed precedence: Ledger Integrity $\rightarrow$ Policy Window $\rightarrow$ Contradictions $\rightarrow$ Evidence $\rightarrow$ Risk & Value Limits.
- **Return Contract**:
  ```python
  Decision(
      assigned_desk="CS_1" | "CS_2" | "CS_3",
      decision_bucket="GENUINE_REFUNDABLE" | "EXCEPTIONAL_PROOF_NEEDED" | "NON_REFUNDABLE",
      next_action="AUTO_APPROVE" | "AWAIT_APPROVAL" | "AWAIT_PROOF" | "AUTO_REJECT" | "MANUAL_REVIEW",
      decision="ELIGIBLE_FOR_AUTHORIZED_REFUND_REVIEW" | "HUMAN_REVIEW_REQUIRED" | "REJECTED_BY_POLICY",
      reason_codes=List[str],
      reviewer_checklist=List[str],
      permitted_actions=List[str]
  )
  ```

---

### 5.3 External Tool Calls: Store Integrations & Gateway Adapters

#### Store Context Tool (`fetch_shopflow_context`)
- **Module**: `backend/app/shopflow.py`
- **Protocol**: HTTP GET via HTTPX client with Bearer authentication.
- **Contract**: Fetches order items, SKUs, customer email/phone, and catalog photos directly from ShopFlow (`/api/ritos/refund-tickets/{id}/context`).
- **Resilience**: Timeout handling (20s) and automatic retry queuing via HTTP 503 if the store is temporarily unreachable.

#### Financial Settlement Tool (`FinancialSettlementService.execute_settlement`)
- **Module**: `backend/app/finance.py`
- **Tool Protocol**:
  1. Validates `Idempotency-Key` and checks for duplicate payload fingerprints.
  2. Enforces Four-Eyes principle ($\text{Executor} \neq \text{Approver} \neq \text{Proposer}$).
  3. Obtains PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) on the transaction and refund rows.
  4. Posts a balanced double-entry `LedgerJournal` entry:
     - `Debit: REFUND_LIABILITY`
     - `Credit: PROCESSOR_CLEARING`
  5. Dispatches request to the `GatewayAdapter` interface (`SANDBOX` or live gateway).

---

### 5.4 LLM / Agent Function Calling Compatibility

While RITOS currently executes tools deterministically for safety and reproducibility, the tool interfaces are **100% compatible with LLM Tool/Function Calling** (such as OpenAI Tools or Anthropic Tool Use):

```json
{
  "type": "function",
  "function": {
    "name": "verify_ledger_ground_truth",
    "description": "Verifies transaction exists, checks customer ownership, and calculates available refundable balance.",
    "parameters": {
      "type": "object",
      "properties": {
        "transaction_id": { "type": "string" },
        "customer_id": { "type": "string" },
        "claimed_amount": { "type": "number" },
        "currency": { "type": "string", "enum": ["INR", "USD", "EUR", "GBP"] }
      },
      "required": ["transaction_id", "customer_id", "claimed_amount", "currency"]
    }
  }
}
```

> [!CAUTION]
> **Strict Financial Safety Boundary:**
> Any tool that modifies financial ledgers (`execute_settlement`) or disburses funds **is never exposed to autonomous LLM tool calling**. Payout tools are strictly gated behind role-based authentication, four-eyes validation, and deterministic database checks.

---

## 6. Port Map & Communication Architecture

| Port | Service | Protocol | Key Endpoints |
| :--- | :--- | :--- | :--- |
| **8000** | RITOS API (FastAPI) | HTTP / REST | `/api/v1/auth/login`, `/api/v1/tickets`, `/api/v1/refunds`, `/webhook/refund-tickets`, `/docs` |
| **5173** | RITOS Desk Portal (Vite) | HTTP / React SPA | Single-page app connecting to `http://localhost:8000/api/v1` |
| **3000** | ShopFlow Store (Next.js) | HTTP / SSR | `/products`, `/orders`, `/api/ritos/refund-tickets/[id]/context`, `/api/ritos/callback` |
| **5432 / 6543** | Supabase PostgreSQL | TCP / Postgres | Port 5432: Session Pooler (RITOS API & Prisma migrations)<br>Port 6543: Transaction Pooler (ShopFlow Prisma runtime) |

---
*Document maintained under `docs/TECHNOLOGY_STACK_AND_TOOL_CALLING_GUIDE.md`.*
