# Antigravity Kickoff Prompt: ShopFlow (RITOS source system)

Paste everything inside the block below into Antigravity (Planning mode). Put the other files from this folder in the repo first (`AGENTS.md` at root, the rest in `/docs`).

---

```
You are building ShopFlow, a runnable e-commerce platform that acts as the SYSTEM OF RECORD for RITOS
(Refund Intelligence & Orchestration System). RITOS is a separate AI service and is NOT built here.

Read these files fully before writing any code, in this order:
1. /AGENTS.md                         (non-negotiable rules)
2. /docs/01_PRD_AND_ARCHITECTURE.md   (scope, boundaries, data model, state machine)
3. /docs/02_API_CONTRACT.md           (exact endpoints and JSON shapes; this is the contract with RITOS)
4. /docs/03_POLICIES_AND_SEED.md      (15 products, policies, customers, scenario data)
5. /docs/04_BUILD_PLAN_AND_ACCEPTANCE.md (phases, tests, definition of done)

Working method:
- First produce an Implementation Plan artifact that maps the docs to the phases in 04. Wait for my approval of the plan.
- Then build phase by phase. At the end of each phase: run migrations/tests, start the app, and verify with real HTTP
  calls (curl or the browser agent). Attach the evidence (test output, screenshots, API responses) as artifacts.
- Do not start a phase until the previous phase's acceptance checks pass.
- If the docs are ambiguous or conflict, stop and ask me. Do not invent API shapes: 02_API_CONTRACT.md wins.
- Every button in the UI must call a working backend endpoint with persisted state. No placeholder buttons.

Hard requirements (details in the docs):
- One command to run everything: `docker compose up` (Postgres + app), then `npm run db:seed`.
- ShopFlow stores facts and executes refunds. RITOS reasons and decides. ShopFlow must never contain refund
  decision logic beyond the clearly separated MOCK_RITOS module.
- GET /api/ritos/refund-tickets/:ticketId/context is the primary contract. Build it to match 02 exactly.
- Refund execution is idempotent and can never exceed the amount paid. Enforce this in the database, not only in code.
- Money is stored as integer paise. Currency INR.
- Seed data must reproduce all 10 scenarios in 03, and the next newly created ticket must be RIT-2026-000123.
- Customers must never see risk or fraud signals.

Definition of done: the end-to-end demo in section 6 of 04_BUILD_PLAN_AND_ACCEPTANCE.md passes, scripted as an
automated test (`npm run test:e2e`), and a browser-agent recording of the happy path and the human-review path is attached.
```

---

## Tips for using Antigravity well with this

- Run **Planning mode** for the first prompt so you can review the plan artifact before code is written.
- Keep `AGENTS.md` at the repo root so every agent session picks up the rules.
- Use one agent for backend/API (phases 1-6) and a second in parallel for the UI (phases 2, 4, 8) once the contract in `02` is frozen. The contract is what lets them work independently.
- Ask the browser agent to run the demo flow in section 6 at the end and record it.
