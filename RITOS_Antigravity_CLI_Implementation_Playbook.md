# RITOS — Antigravity CLI Implementation Playbook
## Complete engineering mission, execution sequence, workstream ownership, and verification rules

**Purpose:** This is the single source of instructions for implementing the existing RITOS application through Antigravity CLI. Give the CLI the instruction: **“Read this entire document and the linked requirements appendix. Follow the steps in order, inspect the existing repository first, and implement incrementally. Do not stop after planning.”**

**Repository:** https://github.com/MohammadAbraransar/RITOS.git  
**Primary branch:** `main`  
**Product:** RITOS — Refund Intelligence & Triage Orchestration System  
**Document prepared:** 2026-10-12

---

# PART I — INSTRUCTIONS TO ANTIGRAVITY CLI

## 1. Your role and objective

Act as the principal software architect and implementation orchestrator for RITOS. Work as a coordinated engineering team covering backend, frontend, database, AI/computer vision, financial systems, security, QA, DevOps, and integration.

Your task is to inspect, complete, test, and production-harden the **existing RITOS repository**. Extend its current working code. Do not create a replacement project, a disconnected demo, a parallel mock application, or a new architecture that discards existing functionality.

The original engineering mission is included in **Part VIII — Full Original Requirements Appendix**. Treat it as the detailed functional specification. This playbook adds the execution sequence, ownership rules, and acceptance gates needed to implement that specification efficiently.

### Definition of success

RITOS must demonstrate an end-to-end, auditable refund workflow that can:

1. Accept and persist a refund request.
2. Verify it against authoritative transaction and order records.
3. retrieve and evaluate the applicable versioned policy.
4. Securely validate and store submitted evidence.
5. Assess product identity and the claimed defect when evidence and a configured vision provider are available.
6. Produce a deterministic, explainable routing decision.
7. Route uncertainty to an appropriate human review process.
8. Enforce role permissions and finance authorization.
9. Record balanced double-entry accounting entries.
10. Execute or track a refund through a configured provider without duplicate settlement.
11. Reconcile the provider's actual status.
12. Display the correct case and settlement state in the existing frontend.
13. Preserve a complete audit trail.

A feature is not complete merely because files or classes exist. It must be integrated, tested, and its actual status documented.

## 2. Mandatory rules

1. Inspect the repository, Git state, working tree, and existing functionality before editing.
2. Protect all uncommitted work and existing remote history. Never force-push, reset, or discard changes to force synchronization.
3. Verify the actual current branch and commit. Do not assume any expected commit exists locally.
4. Preserve working features, routes, APIs, authentication, roles, database models, and styling conventions wherever possible.
5. Reuse the existing stack. The expected stack may include React + TypeScript + Vite, FastAPI + Pydantic, SQLAlchemy, PostgreSQL, and Redis/Celery, but confirm it from repository files before making decisions.
6. Do not replace an existing implementation just because a fresh implementation is easier to generate.
7. Do not create duplicate models, endpoints, agent modules, queues, or decision engines. Extend equivalent working components.
8. Do not change the database schema destructively, delete a database, reset migrations, or remove data. Add forward migrations with a safe rollback strategy.
9. Do not invent data, provider results, delivery confirmations, successful payouts, confidence percentages, model accuracy, test results, or health metrics.
10. Never let an LLM authorize a refund, determine authoritative payment status, calculate the authoritative refundable balance, bypass permissions, or independently execute a payout.
11. Treat uncertainty as uncertainty. A model timeout, poor-quality image, contradictory evidence, or high-risk signal is not by itself proof of fraud or a reason for automatic denial.
12. Keep live financial settlement disabled until production prerequisites have been verified and explicitly authorized.
13. Use environment variables and secret-management mechanisms. Never commit real keys, credentials, tokens, payment details, private customer evidence, or production database dumps.
14. Add dependencies only when needed. Reuse current compatible libraries and providers.
15. Use small, reviewable changes with targeted tests after each milestone.
16. Do not weaken or delete tests to obtain a passing result.
17. Report executed checks truthfully. Distinguish passed, failed, skipped, and blocked.
18. If credentials or external systems are unavailable, implement the safe provider interface and explicit unavailable state where possible; document exact setup requirements. Do not pretend the integration works.
19. If execution is interrupted, inspect the actual repository and current progress before resuming. Do not blindly replay earlier steps.
20. Do not claim production readiness until every mandatory release gate is verified.

## 3. First action: inspect before modifying

Start by running safe inspection commands from the repository root, as appropriate:

```bash
pwd
git status --short --branch
git branch --show-current
git log -1 --oneline
git remote -v
```

Inspect the repository tree, dependency manifests, lockfiles, migrations, environment templates, CI configuration, tests, Docker files, deployment files, frontend routes, backend routers, services, models, worker definitions, and integration adapters.

Do not print secret values. Inspect only environment variable names and whether required values are configured; redact sensitive values from any logs.

Run existing baseline checks before changes when dependencies and services permit. Discover actual project commands from the repository rather than assuming commands.

Create or update these project documents:

- `docs/engineering-audit.md`
- `docs/implementation-roadmap.md`
- `docs/architecture-and-contracts.md`
- `docs/verification-log.md`
- `docs/operations-and-integrations.md`

The audit must record:
- Existing stack and repository structure.
- Current Git state and relevant commit.
- Existing working features and routes.
- Existing models, APIs, workers, integrations, and tests.
- Baseline command results.
- Known mocks, hardcoded decisions, duplicated logic, security gaps, and unfinished work.
- Dependencies and blockers.
- The smallest safe implementation path.

Every claim must be based on inspected code, configuration, or an actually executed command. Do not assume the repository has a feature simply because it is in the requirements.

After the audit, continue into the first safe implementation milestone. Do not stop after producing a plan unless a destructive, irreversible, or materially ambiguous decision requires user input.

## 4. Implementation phases and dependencies

Implement in this order. Independent tasks may run in parallel only after shared contracts and file ownership are agreed.

### Phase 0 — Repository audit and baseline

**Scope**
- Inspect repository and Git state.
- Map existing architecture and functionality.
- Run available baseline tests/builds.
- Identify real gaps and external blockers.
- Create the engineering audit and roadmap.

**Exit gate**
- Existing behavior and baseline failures are documented.
- No working feature has been overwritten.
- Implementation dependencies and module ownership are clear.

### Phase 1 — Foundation, contracts, data integrity, and security

**Scope**
- Reuse or extend existing user, role, customer, product, order, transaction, refund, evidence, policy, review, settlement, ledger, audit, notification, and integration models.
- Add only missing schema elements and forward migrations.
- Define shared Pydantic request/response models and error formats.
- Enforce backend authentication and authorization.
- Add audit events and request correlation IDs.
- Establish status-transition and tenant-isolation rules where applicable.
- Use integer minor currency units and explicit currency codes.
- Use UTC-aware timestamps.
- Add database foreign keys, unique constraints, indexes, and integrity checks.

**Exit gate**
- Migrations apply safely to a test database.
- Shared contracts are documented.
- Authorization and key data-integrity rules have tests.
- Existing endpoints and workflows remain compatible or have documented migration paths.

### Phase 2 — Minimum end-to-end refund workflow

**Scope**
- Persist a refund request.
- Verify the order and transaction using authoritative backend records.
- Calculate refundable balance from ledger data, accounting for prior refunds, reservations, reversals, and chargebacks.
- Evaluate the correct versioned policy.
- Persist the case and decision trace.
- Route the case deterministically to CS-1, CS-2, or CS-3.
- Expose the workflow through typed API endpoints.
- Provide a first integration path from the existing frontend to the real API.

**Exit gate**
- A test refund can flow from API request through database persistence, ledger verification, policy evaluation, and deterministic routing.
- Missing transactions and insufficient balance cannot result in a payout.
- The decision trace identifies facts, policy version, rules, and reason codes.
- Tests cover eligible, ineligible, contradictory, and unresolved cases.

### Phase 3 — Evidence and visual intelligence

**Scope**
- Secure upload, validation, private storage, hashing, access controls, and evidence lifecycle.
- Product identity assessment distinct from defect assessment.
- Catalog/SKU/variant/reference-image comparison when real references exist.
- Defect-specific evaluation and evidence-sufficiency rules.
- Model/provider adapters with explicit failure and unavailable states.
- Human review and additional-evidence requests for inconclusive results.
- Persist evidence references, findings, provider/model versions, timestamps, and processing status.

**Exit gate**
- Evidence can be uploaded and retrieved only by authorized roles.
- Correct product, mismatch, inconclusive, insufficient-quality, corrupt-file, and provider-timeout cases are tested.
- No unsupported confidence claims or fabricated visual findings are shown.
- Uncertainty routes to review instead of automatic denial.

### Phase 4 — Financial settlement and accounting

**Scope**
- Finance approval queue and separation of duties.
- Immutable double-entry journals and configured accounting mappings.
- Persistent idempotency keys and request fingerprints.
- Provider-specific gateway adapter and sandbox configuration.
- Webhook signature verification and replay protection.
- Durable settlement states, reconciliation, timeout recovery, and compensating entries.
- Concurrent refund/settlement protection.

**Exit gate**
- Unauthorized actions fail.
- Duplicate requests cannot initiate duplicate payouts.
- Repeated key + same payload returns the original result; same key + different payload is rejected.
- Posted journals balance.
- An ambiguous timeout triggers reconciliation, not a blind second payout.
- Sandbox behavior is verified where credentials/provider access are available.
- Live payout remains disabled until explicit release authorization.

### Phase 5 — Durable automation and external integrations

**Scope**
- Reuse the existing background worker system where possible.
- Implement reliable event delivery using a transactional outbox or equivalent.
- Add deduplication, bounded retries, dead-letter handling, recovery, and observability.
- Automate evidence requests, reviewer assignment, SLA escalation, notifications, reconciliation, and operational alerts.
- Add provider health checks and clear configuration guidance.

**Exit gate**
- Events and jobs are durable and idempotent.
- Failures are observable and recoverable.
- No simulated activity is presented as real processing.
- External side effects are authorized, auditable, and protected against duplicate execution.

### Phase 6 — Frontend integration and role workflows

**Scope**
- Extend the existing frontend; do not generate a parallel app.
- Connect role dashboards to real API data.
- Complete customer, support operator, reviewer/supervisor, finance, and administrator workflows.
- Add functional evidence inspection, status history, decision explanations, finance approvals, error handling, empty states, loading states, and responsive/accessibility behavior.
- Implement server-side pagination and filtering where appropriate.
- Ensure frontend controls call actual APIs or navigate to valid routes.

**Exit gate**
- Production build and configured type/lint checks pass.
- Critical user journeys are tested.
- Dashboard metrics come from actual data.
- Backend authorization protects every privileged action regardless of frontend visibility.

### Phase 7 — Release verification and operations

**Scope**
- Run full tests and builds.
- Verify migrations and PostgreSQL transaction/concurrency behavior.
- Run security, dependency, and configuration checks.
- Verify gateway sandbox flows and webhook behavior.
- Verify backup and restore when infrastructure is configured.
- Document deployment, recovery, rollback, monitoring, retention, and incident response.
- Produce the final feature-by-feature verification report.

**Exit gate**
- Every required gate is either verified or explicitly blocked with evidence and owner/action.
- Do not call the system production-ready if any mandatory release gate is unverified.

## 5. Workstream ownership

Use Antigravity's supported task/subagent capabilities if available. If not, perform the same work sequentially as the orchestrator. Do not assume a particular CLI flag or agent command exists; inspect the installed CLI help and use only supported features.

### Workstream A — Shared architecture, data, and security
Owns shared schemas, models, migrations, authentication/authorization integration, audit logging, and cross-module contracts.

### Workstream B — Adjudication and orchestration
Owns ledger verification services, policy evaluation, claim analysis, risk assessment, logistics evaluation, deterministic routing, and decision traces.

### Workstream C — Evidence and computer vision
Owns secure evidence processing, product identity, defect-specific assessments, evidence sufficiency, model adapters, and vision test fixtures.

### Workstream D — Finance
Owns authorization of settlement, accounting journals, idempotency, payment adapters, webhooks, reconciliation, and recovery.

### Workstream E — Frontend
Owns existing frontend integration, API clients/types, role-aware views, forms, evidence display, status presentation, and UX error/loading/empty states.

### Workstream F — Automation and operations
Owns background jobs, event delivery, retries, dead letters, notifications, reviewer assignment, SLA monitoring, and integration health.

### Workstream G — QA and release verification
Owns cross-module testing, regression coverage, PostgreSQL concurrency tests, security checks, build verification, and release reporting.

### Coordination rules
Before parallel execution:
1. Publish shared schemas and API contracts.
2. Identify file ownership and dependencies.
3. Prevent overlapping edits to critical modules.
4. Use separate branches/worktrees only if supported and safe.
5. Require each workstream to report changed files, tests run, actual results, and blockers.
6. Review changes before integration.
7. Run integration tests after merging workstreams.

The orchestrator retains ownership of architecture, final integration, and acceptance decisions. Do not let multiple agents independently redesign the same database schema, auth system, orchestrator, or settlement logic.

## 6. Functional architecture and AI boundaries

Keep a strict separation between:
- Authoritative transaction and order facts.
- Versioned merchant policy and applicable legal rules.
- Model-generated semantic/visual assessments.
- Deterministic routing and authorization.
- Human decisions and overrides.
- Financial settlement and provider confirmation.

AI may assist with:
- Claim categorization and text interpretation.
- OCR and semantic interpretation.
- Product image similarity.
- Defect localization and visual assessment.
- Evidence sufficiency suggestions.

Deterministic code must govern:
- Refundable balance arithmetic.
- Policy time windows and rules.
- Role authorization.
- Monetary thresholds.
- Idempotency.
- Accounting balance.
- Duplicate prevention.
- Status transitions.
- Routing precedence and settlement readiness.

Validate model outputs against strict schemas. Persist the model/provider identifier, relevant input/evidence references, result, timestamp, and failure state. If a model is nondeterministic, persist its assessment and make downstream routing deterministic from the persisted assessment and policy version.

Do not claim that a vision model proves authenticity, detects all tampering, or determines intent with certainty. Do not train a custom model without a documented dataset, reproducible training, and evaluation.

## 7. Decision routing requirements

Apply this precedence:
1. Ledger integrity and verified refundable balance.
2. Applicable policy and valid exceptions.
3. Product identity, defect evidence, logistics contradictions, risk, and evidence quality.
4. Actor authorization and required review.
5. Settlement readiness.

**CS-1 — Fast-track**
Only when every configured prerequisite is satisfied: verified transaction/balance, policy eligibility, adequate product/defect evidence where required, no unresolved material contradiction, no mandatory review flag, amount within configured limit, and required authorization.

**CS-2 — Exceptions/review**
Use for uncertain identity, inconclusive defect, poor image quality, variant mismatch, missing evidence, conflicting carrier information, high-value threshold, risk review, or conflicting assessments. Include specific reason, evidence needed, reviewer checklist, and allowed next actions.

**CS-3 — Policy-ineligible/denial review**
Use only when an authoritative applicable rule establishes ineligibility. Distinguish a final denial from an unresolved investigation. A suspected fraud signal, ambiguous image, or provider failure is not sufficient on its own to establish fraud or justify final denial.

Store reason codes, supporting evidence, policy/rule versions, reviewer overrides, and customer-facing explanations.

## 8. Financial invariants

- No settlement without a verified transaction and sufficient available refundable balance.
- Use database transactions, row-level locking or an equivalent safe concurrency control, and uniqueness constraints.
- Reserve refundable balance safely when concurrent requests are possible.
- Store money in integer minor units and explicit currency.
- Each posted journal must have equal total debits and credits in the same currency.
- Posted journal entries are immutable; correct errors with compensating entries.
- Enforce finance role permissions on the backend.
- Apply four-eyes approval when configured; prevent self-approval where required.
- Use persistent idempotency keys and payload fingerprints.
- A timeout after sending a provider request is an uncertain state. Reconcile the provider before any retry.
- A successful API response means only what the provider actually confirms; do not overstate bank receipt.
- Keep live payouts disabled until explicitly authorized release checks are complete.

## 9. Evidence and privacy invariants

- Validate file signature/MIME, decode safely, enforce file-size and pixel limits, and protect against malformed files and decompression bombs.
- Store evidence privately and enforce authorization on retrieval.
- Persist hashes, storage references, timestamps, uploader, processing state, and access records.
- Treat image content, OCR, EXIF, embedded text, QR codes, and metadata as untrusted input.
- Metadata absence is not proof of manipulation.
- Computer-vision statistics are supporting signals, not conclusive semantic evidence.
- Apply appropriate retention/deletion policies, sensitive-data minimization, and auditability.
- Request specific additional evidence when requirements are not met.

## 10. API and operational requirements

Create or extend typed endpoints for authentication, refund creation/retrieval, transaction verification, catalog lookup, evidence upload/retrieval, identity assessment, defect verification, policy evaluation, risk assessment, orchestration, review, finance approval, settlement, reconciliation, audit history, and health/readiness.

Use consistent error schemas, appropriate HTTP status codes, input validation, request-size limits, rate limiting, secure secret handling, structured logs, and request correlation IDs.

Separate basic liveness from readiness. Report critical dependencies individually. Database outage, vision-provider outage, or gateway failure must never yield fabricated success.

External integrations need explicit configuration, timeouts, bounded retries, health checks, and failure states. Use actual provider adapters. When a provider is unavailable, report that state and provide setup instructions.

## 11. Frontend requirements

Preserve the current frontend framework, package manager, routes, and conventions. Use a professional accessible enterprise interface with a light/neutral foundation and restrained navy accents if consistent with the existing design.

Required functional areas:
- **Customer:** submit refund, view orders/history, upload evidence, respond to evidence requests, see adjudication and settlement status, view communications.
- **Support operator:** queue, search/filter, verify transaction/policy, inspect evidence, view decision explanations, communicate, propose or escalate cases.
- **Reviewer/supervisor:** exception queue, evidence disputes, high-value approvals, workload/SLA, policy overrides with mandatory reason, investigation queue.
- **Finance:** authorized settlements, four-eyes approval, journal viewer, provider status, failure recovery, reconciliation, financial reports.
- **Administrator:** users/roles, policy versions, catalog/provider configuration, audit logs, queue/worker health, model versions/evaluation, operational alerts.

All views must use real backend data. Do not display fabricated revenue, refund counts, processing times, activity, or accuracy. Implement loading, empty, error, and retry states. Keep server-side permissions authoritative.

## 12. Required test matrix

Create/extend tests for the following categories.

### Ledger and policy
- Valid transaction and sufficient balance.
- Missing transaction.
- Currency mismatch.
- Duplicate refund and exhausted balance.
- Concurrent refund requests.
- Expired return window and valid exceptions.
- Incorrect/timezone-sensitive delivery timestamps.

### Product identity and vision
- Correct product and variant.
- Wrong model/color/variant.
- Claimed defect visible and normal appearance.
- Defect outside claimed region.
- Blurry/poorly lit image.
- Missing references and insufficient identity evidence.
- Unrelated, blank, corrupt, or oversized image.
- Repeated upload.
- Missing metadata and suspicious provenance.
- Vision provider timeout.
- Low-confidence/inconclusive result routed to review.

### Routing
- Eligible low-risk case.
- High-value case.
- Product mismatch.
- Inconclusive defect.
- Confirmed duplicate.
- Policy-ineligible request.
- Carrier contradiction.
- Risk flag.
- Provider outage.
- Human override with audit history.

### Finance
- Unauthorized action rejected.
- Four-eyes separation.
- Balanced journal.
- Repeated idempotency key.
- Same key with different payload.
- Concurrent settlement attempts.
- Gateway timeout after request submission.
- Webhook replay.
- Failed settlement reconciliation.
- Compensating reversal.
- Exact accounting balance maintained.

### Frontend and API
- Role permissions.
- Evidence upload/preview.
- Case status changes.
- Decision explanation rendering.
- Finance approval.
- API failure/retry.
- Responsive workflows and accessibility checks where configured.

Use real PostgreSQL for tests involving locking, transactions, constraints, and concurrency. Test fixtures may be synthetic but must be clearly identified as test data and never presented as production evidence.

## 13. Verification commands and release gates

Discover commands from the actual repository and use its package manager. Common expected checks, only when applicable, include:

```bash
pytest -q
npm run build
```

Also run configured:
- Frontend type checking and linting.
- Backend lint/type checking.
- Migration validation against a clean test database.
- API integration tests.
- PostgreSQL concurrency tests.
- Security and dependency checks.
- Settlement/accounting invariants.
- Provider sandbox tests.
- Backup/restore verification.
- Deployment configuration checks.

Never report a command as passed if it was not executed. If a service, credential, test database, or provider is unavailable, mark the check as `BLOCKED` and specify what is missing.

## 14. Status tracking and handoff format

Maintain `docs/implementation-roadmap.md` with these statuses:
- `NOT_STARTED`
- `IN_PROGRESS`
- `BLOCKED`
- `IMPLEMENTED`
- `TESTED`
- `VERIFIED`

`IMPLEMENTED` means code exists. `TESTED` means relevant tests actually ran. `VERIFIED` means the acceptance criteria have been demonstrated with evidence. These are not interchangeable.

After each milestone, update `docs/verification-log.md` and report:
1. What was implemented.
2. Files/modules changed.
3. Commands actually executed and results.
4. Existing functionality preserved.
5. New regressions or issues.
6. External blockers/configuration needed.
7. Remaining incomplete work.
8. Next milestone.

Record requirement references and evidence of verification for each feature.

## 15. Deployment and live operation

Provide environment templates with placeholders only, database migration instructions, worker startup, frontend deployment, health checks, structured logging, audit retention, monitoring/alerts, backup and restore, secret rotation, provider setup, incident recovery, and rollback instructions.

Use staging and payment-gateway sandbox first. Keep live settlement disabled until credentials, accounting mappings, approval permissions, webhook verification, reconciliation, backup restoration, security checks, and release gates have been verified and the user explicitly authorizes live operation.

## 16. Final execution instruction

Read this playbook completely, then read the full original requirements appendix in Part VIII.

Start by inspecting the existing repository and Git state. Create the audit and baseline verification records. Then implement the first safe milestone and continue in dependency order. Do not stop after writing plans. Do not generate every module blindly. Do not replace working code. Do not claim success without evidence.

At the end, provide a feature-by-feature report with `IMPLEMENTED`, `TESTED`, `VERIFIED`, `BLOCKED`, or `INCOMPLETE` status and actual supporting evidence.

---

# PART II — HOW THE USER SHOULD START THE CLI

From the existing RITOS repository, first verify the working tree and branch. Keep a recoverable state before changes. Make sure this document is accessible to the CLI, for example at:

`docs/ANTIGRAVITY_RITOS_IMPLEMENTATION_PLAYBOOK.md`

If you save this file there, keep the original requirements as a separate file, for example:

`docs/requirements/ritos-engineering-mission.md`

Then give Antigravity this short instruction:

> Read `docs/ANTIGRAVITY_RITOS_IMPLEMENTATION_PLAYBOOK.md` from beginning to end, including Part VIII and its full original requirements appendix. Follow it as the implementation contract. Inspect the existing repository and Git state first. Do not replace or scaffold a new application. Run baseline checks, document the audit, then implement milestone by milestone in the specified order. Use only CLI capabilities that are actually available. After each milestone, run the relevant tests, update the roadmap and verification log, and report actual results. Continue implementing instead of stopping after planning. Never claim unexecuted tests passed or enable live payouts without explicit authorization.

If the document is not at that path, tell Antigravity the correct path before asking it to execute.

---

# PART III — MILESTONE PROMPTS

Use these prompts only when you need to steer a stalled or overly broad run. The main playbook remains authoritative.

## Milestone 0 — Audit

> Execute the repository audit only as the first controlled step. Inspect Git state, architecture, APIs, database, migrations, frontend, workers, integrations, tests, and deployment. Run baseline checks where possible. Update the engineering audit, implementation roadmap, architecture/contracts, and verification log. Preserve working code. Identify the next smallest safe implementation step. Then proceed into that step unless a destructive or materially ambiguous decision requires my input.

## Milestone 1 — Foundation

> Implement the highest-priority missing foundation based on the audit: shared schemas, safe migrations, data integrity, permissions, audit logging, and contracts. Reuse existing code. Add tests and run them. Review the diff and report verified outcomes and blockers. Do not implement unrelated features in this milestone.

## Milestone 2 — End-to-end refund workflow

> Implement and integrate refund submission, authoritative ledger verification, versioned policy evaluation, case persistence, deterministic CS-1/CS-2/CS-3 routing, and a traceable decision result. Add tests for eligible, ineligible, missing-transaction, insufficient-balance, and inconclusive cases. Verify the actual API-to-database workflow.

## Milestone 3 — Evidence and vision

> Implement secure evidence intake, product identity verification, defect-specific assessment, evidence sufficiency, and manual-review escalation according to the playbook. Reuse existing provider/storage abstractions. Test mismatches, normal/defective appearances, poor image quality, invalid files, missing references, and provider failures. Do not claim model accuracy without labeled evaluation data.

## Milestone 4 — Financial controls

> Implement finance authorization, separation of duties, double-entry journals, idempotency, sandbox gateway integration, webhook verification, and reconciliation. Test concurrency, duplicate requests, balanced journals, and ambiguous provider timeouts. Do not enable live payouts.

## Milestone 5 — Automation

> Implement reliable background processing, durable event delivery, deduplication, bounded retries, dead-letter handling, recovery, reviewer assignment, notifications, SLA escalation, and integration health. Test repeated and interrupted jobs. Do not present simulated events as real processing.

## Milestone 6 — Frontend integration

> Connect the existing frontend to verified backend contracts and complete the required customer, operator, reviewer/supervisor, finance, and administrator workflows. Use real backend data and server-side permissions. Preserve existing routes and styling. Implement loading, error, and empty states. Run the production build and applicable tests.

## Milestone 7 — Release verification

> Verify the complete application against the playbook and original requirements. Run actual backend/frontend checks, migration validation, PostgreSQL concurrency tests, security checks, integration tests, sandbox settlement tests, and backup/restore checks where configured. Fix regressions where possible. Report every requirement as implemented, tested, verified, blocked, or incomplete. Do not declare production readiness while any mandatory gate remains unverified.

---

# PART IV — WORKSTREAM DEPENDENCY MAP

Use this as a coordination aid; it does not authorize unsafe parallel edits.

| Workstream | Owns | Depends on |
|---|---|---|
| A. Shared architecture/data/security | Models, migrations, contracts, permissions, audit | Repository audit |
| B. Adjudication/orchestration | Ledger, policy, claim/risk/logistics, routing | Shared contracts |
| C. Evidence/vision | Secure storage, identity, defect assessment | Product/evidence contracts |
| D. Finance | Accounting, approvals, idempotency, gateway | Refund/authorization contracts |
| E. Frontend | Role-based screens, API client, workflows | Stable API contracts |
| F. Automation | Workers, events, retries, notifications | Persisted states and service contracts |
| G. QA/release | Integration, security, concurrency, release gates | All integrated workstreams |

Do not allow independent workstreams to make conflicting changes to shared database models, authentication, the orchestration engine, or settlement services. Publish contracts first and integrate through reviewed changes.

---

# PART V — COMPLETION CHECKLIST

Antigravity must use this checklist in the roadmap and final report.

## Repository and engineering
- [ ] Current Git state documented.
- [ ] Existing working functionality mapped.
- [ ] Baseline backend/frontend checks executed where possible.
- [ ] Safe migrations and rollback/recovery approach documented.
- [ ] No secrets or private data committed.

## Core refund workflow
- [ ] Refund request persisted.
- [ ] Authoritative transaction and balance verification.
- [ ] Policy version and rule identifiers recorded.
- [ ] Deterministic routing and decision trace.
- [ ] Uncertainty routed to review.
- [ ] Audit history preserved.

## Evidence
- [ ] Secure upload and access control.
- [ ] Product identity separate from defect assessment.
- [ ] Evidence sufficiency rules.
- [ ] Explicit provider failure states.
- [ ] Additional-evidence request workflow.
- [ ] Vision limitations communicated honestly.

## Finance
- [ ] Backend finance permissions.
- [ ] Separation of duties/four-eyes controls.
- [ ] Balanced immutable double-entry journal.
- [ ] Persistent idempotency and duplicate protection.
- [ ] Gateway sandbox flow.
- [ ] Webhook signature and replay protection.
- [ ] Timeout reconciliation and recovery.
- [ ] Live settlement disabled until explicitly authorized.

## Automation and frontend
- [ ] Durable event delivery and recoverable jobs.
- [ ] Duplicate side effects prevented.
- [ ] Integration health and actionable failures.
- [ ] Customer, operator, reviewer/supervisor, finance, and admin workflows connected to real APIs.
- [ ] Loading, error, and empty states.
- [ ] No fabricated dashboard metrics.

## Release readiness
- [ ] Backend tests actually run.
- [ ] Frontend production build actually run.
- [ ] Type/lint checks run where configured.
- [ ] Migration validation.
- [ ] PostgreSQL concurrency tests.
- [ ] Security/dependency checks.
- [ ] API integration tests.
- [ ] Settlement/accounting invariants.
- [ ] Sandbox provider tests.
- [ ] Backup restoration verified where configured.
- [ ] Unresolved risks and blockers documented.
- [ ] Every feature's status is evidence-based.

---

# PART VI — REQUIRED REPORT FORMAT

At the end of each milestone, produce:

### Milestone report
- **Milestone:**
- **Status:** NOT_STARTED / IN_PROGRESS / BLOCKED / IMPLEMENTED / TESTED / VERIFIED
- **Summary:**
- **Files changed:**
- **Existing behavior preserved:**
- **Commands actually executed:**
- **Test results:** passed / failed / skipped / blocked
- **Database or API changes:**
- **Security and financial invariants checked:**
- **External dependencies or credentials required:**
- **Known defects and unresolved risks:**
- **Next action:**

At final delivery, include:
1. Original repository state.
2. Implemented architecture and file changes.
3. Migrations and data changes.
4. Agent contracts and orchestration.
5. Product identity and defect-verification status.
6. Evidence storage and review workflows.
7. Deterministic policy/routing.
8. Accounting and settlement safeguards.
9. Provider integration status.
10. Role-based frontend workflows.
11. Exact tests/builds and results.
12. Setup and deployment instructions.
13. Limitations and unresolved issues.
14. Feature-by-feature release-readiness matrix.

---

# PART VII — IMPORTANT INTERPRETATION RULES

- The existing repository is the implementation source of truth; the requirements describe intended behavior.
- Where the repository already has equivalent working functionality, extend it instead of duplicating it.
- Example return windows and monetary thresholds in the original requirements are configurable defaults, not universal legal rules.
- Never invent legal citations. Use maintained, jurisdiction-specific sources and validated rulesets.
- Never infer fraud solely from a risk score, claim frequency, image metadata, or a vision-model result.
- Never let AI replace deterministic ledger arithmetic, authorization, or financial controls.
- Never treat a gateway API success as proof of final bank receipt unless the provider confirms it.
- Never claim a test, integration, migration, backup restore, or release gate was verified unless it was actually executed.
- If an external dependency prevents verification, keep the integration state explicit and report the exact blocker.
- Production readiness is an evidence-based conclusion, not a status to set manually.

---

# PART VIII — FULL ORIGINAL REQUIREMENTS APPENDIX

The original RITOS engineering mission is reproduced below so that this playbook remains self-contained. Preserve its detailed module, workflow, testing, and release requirements. If this appendix and the execution playbook appear to conflict, do not silently discard a requirement: inspect the existing repository, retain all safety invariants, and document the conflict and a safe resolution in the architecture/decision log.


---

# MASTER ENGINEERING MISSION: RITOS — Production-Grade Refund Intelligence, Visual Evidence Verification, Deterministic Multi-Agent Adjudication & Financial Settlement Platform

## 1. Mission and Engineering Objective

You are the principal software architect, senior Python backend engineer, computer vision engineer, financial systems engineer, QA engineer, and frontend integration engineer responsible for upgrading the existing RITOS platform.

**RITOS — Refund Intelligence & Triage Orchestration System** is an enterprise-grade e-commerce refund governance platform that combines transaction reconciliation, product identity verification, visual defect analysis, return-policy enforcement, logistics verification, fraud-risk analysis, deterministic decision orchestration, human review, and double-entry financial settlement.

Your task is to inspect, complete, test, and production-harden the existing RITOS repository.

Repository:
`https://github.com/MohammadAbraransar/RITOS.git`

Primary branch: `main`

Expected baseline commit: `ade7bbb`, or the latest verified commit on `main`.

### Non-negotiable objective

Transform RITOS into a functional, auditable, evidence-driven refund processing system in which:

- Every refund decision is traceable to real transaction records, policy versions, product information, evidence, and risk signals.
- Every image is evaluated against the actual product, claimed defect, and available reference evidence.
- Every agent produces validated structured outputs with supporting evidence and explicit uncertainty.
- Every routing decision follows a versioned, deterministic policy engine.
- Every financial settlement is authorized, idempotent, transactionally consistent, and recorded through double-entry accounting.
- Every external integration has explicit configuration, timeout handling, retries, health checks, and failure states.
- Every customer, support agent, reviewer, and finance approver sees only the data and actions permitted by their role.
- No mock response, fabricated evidence, hardcoded success, synthetic production fallback, or unverified payout is presented as real.

Do not merely generate an architecture document or redesign the dashboard. Implement the working backend, database schema, API contracts, integrations, frontend workflows, automated tests, and operational verification.

---

## 2. Repository Inspection and Safe Development Workflow

Before modifying any files:

1. Inspect the current repository, Git status, current branch, latest commit, existing database models, API endpoints, migrations, background workers, tests, frontend, environment configuration, and deployment files.
2. Identify existing functionality that works and preserve it.
3. Identify incomplete implementations, mock responses, hardcoded decisions, duplicated logic, security issues, and broken integrations.
4. Establish a baseline by running the existing backend tests and frontend build.
5. Create a dated engineering report identifying the current implementation status.
6. Protect uncommitted changes and existing remote history. Never overwrite GitHub history or discard local changes to force synchronization.
7. Use small, reviewable implementation stages and maintain backward-compatible API behavior where feasible.

Do not assume that commit `ade7bbb` exists locally. Fetch and verify the actual remote commit history before using it as a baseline.

Never delete the current database, reset migrations, replace the project wholesale, or regenerate working files without establishing a verified backup and migration plan.

If Antigravity execution is interrupted, resume from the actual repository state instead of blindly repeating previous modifications.

---

## 3. Core System Architecture

Build a modular, production-oriented architecture with clear separation of concerns.

### Backend

- Python
- FastAPI
- Pydantic v2
- SQLAlchemy 2.x
- PostgreSQL
- Alembic migrations
- Redis for optional distributed caching, queues, and idempotency coordination
- Celery, RQ, or an existing compatible worker system for asynchronous processing
- Pillow and NumPy for image processing
- OpenCV for optional advanced visual analysis
- A configurable, replaceable vision model for semantic product and defect comparison
- pytest for automated testing

Use the existing stack where appropriate instead of introducing unnecessary replacements.

### Frontend

Preserve the existing frontend framework and package manager.

Deliver a clean, professional enterprise interface with a white or light-neutral visual foundation, restrained navy accents, clear status colors, accessible controls, responsive layouts, and separate role-based dashboards.

Avoid excessive neon effects, cluttered cards, artificial activity counters, decorative metrics presented as real data, and nonfunctional controls.

### Required backend modules

Implement or extend the following modules, adapting their structure to the existing repository:

- `backend/app/orchestrator.py`
- `backend/app/agents/ledger_agent.py`
- `backend/app/agents/policy_agent.py`
- `backend/app/agents/claim_reason_agent.py`
- `backend/app/agents/risk_agent.py`
- `backend/app/agents/logistics_agent.py`
- `backend/app/agents/decision_agent.py`
- `backend/app/agents/product_identity_agent.py`
- `backend/app/agents/defect_verification_agent.py`
- `backend/app/agents/communication_agent.py`
- `backend/app/proof_reader.py`
- `backend/app/finance.py`

These are logical responsibilities, not a requirement to create redundant modules if equivalent working components already exist.

Use typed request and response models for all agent inputs, outputs, evidence references, routing decisions, and financial operations.

---

## 4. Nine-Specialist Refund Adjudication Pipeline

Implement a coordinated pipeline in which each specialist has a defined responsibility, explicit inputs, structured outputs, and auditable execution results.

### Agent 1 — Ledger Ground Truth and Payment Gateway Reconciliation

Query real database records using the order ID, transaction ID, customer ID, and payment reference.

Verify:

- The original transaction exists.
- The transaction belongs to the relevant customer and order.
- The currency matches the original payment.
- The amount paid and captured amount are consistent.
- Previous refunds, pending refund reservations, reversals, and chargebacks are accounted for.
- The requested amount does not exceed the available refundable balance.
- The payment gateway reference matches the configured provider's records.
- The transaction is in a state that permits a refund.

Calculate the available balance from authoritative ledger records, not client-submitted values.

Use database transactions and appropriate row-level locking to prevent concurrent requests from exceeding the refundable balance.

Return structured results containing verification status, balance calculations, discrepancies, evidence references, and failure codes.

A missing transaction or impossible ledger state must never result in automatic payout. Route it to a denial or investigation workflow according to the configured policy.

A gateway timeout or unavailable database must produce an explicit processing failure or pending verification state, not a false fraud accusation.

### Agent 2 — Product Category and Return Policy Enforcement

Retrieve the actual SKU, product category, purchase date, delivery timestamp, applicable return policy, policy version, and relevant product-specific restrictions.

Support configurable policy rules such as:

- Electronics: 14-day return window.
- Apparel and lifestyle: 30-day return window.
- Perishables and consumables: configured non-returnable or restricted-return rules.
- Digital software and subscriptions: redemption, activation, consumption, and cancellation conditions.

Treat these values as configurable example defaults, not universal legal requirements.

Calculate elapsed time using timezone-aware UTC timestamps and the precise effective date of the applicable policy.

Handle delivery-date exceptions, delayed delivery, statutory consumer rights, warranty claims, defective goods, and merchant-specific overrides through explicit policy rules.

Store the exact policy version and rule identifiers used in each decision.

Do not invent statutory citations. Any legal reference must be sourced from a maintained, jurisdiction-specific legal ruleset and validated before use.

### Agent 3 — Customer Claim Intent and Contradiction Analysis

Analyze the customer's selected reason, written explanation, order information, product type, logistics records, and submitted evidence.

Normalize claims into controlled categories:

- Defective product
- Physical damage
- Loose stitching or seam failure
- Wrong product received
- Product materially different from description
- Missing item or parts
- Item not received
- Incorrect size or fit
- Late delivery
- Changed mind
- Digital product access or activation issue
- Other or unclear reason

Identify contradictions using actual supporting records.

Examples:

- A customer reports non-delivery while verified carrier records show a signed delivery.
- A customer reports physical damage to a digital-only product.
- A customer reports a missing accessory while the submitted package evidence appears to show that accessory.
- A customer reports loose stitching, but the submitted image does not show the relevant seam.

A contradiction is a reason for further verification, not automatic proof of customer fraud.

Use deterministic rules for structured facts. If an NLP or language model is used, constrain it to extracting claims and classifying supplied text. Never let free-form model output independently authorize or reject a payout.

### Agent 4 — Historical Risk and Claim Velocity Engine

Query actual historical customer, order, transaction, and refund records.

Calculate:

- Claims during the trailing 30, 90, and 365 days.
- Approved, denied, disputed, and pending refund totals.
- Refund-to-lifetime-GMV ratio using clearly defined accounting rules.
- Repeated claims against the same SKU, order, shipping address hash, or payment instrument.
- Unusual claim frequency and configured velocity thresholds.
- Previously confirmed abuse indicators, where legally and operationally appropriate.
- Amount-based supervisory review requirements.

For example, claims exceeding ₹5,000 may require manual supervisory review.

Keep thresholds configurable by merchant, currency, risk tier, and policy version.

Use pseudonymized identifiers where possible. Do not expose payment credentials, full IP histories, or sensitive customer data unnecessarily.

Do not equate a high refund frequency with confirmed fraud. Distinguish an anomaly, an unresolved suspicion, and a verified violation.

### Agent 5 — Carrier and Logistics Verification

Integrate with actual configured carrier APIs or a normalized logistics-provider adapter.

Retrieve and verify:

- Tracking number and carrier identity.
- Shipment and delivery milestones.
- Delivered timestamp.
- Proof-of-delivery reference and verification status.
- Delivery address consistency.
- Recorded package weight where available.
- Return-shipment tracking.
- Carrier-reported damage or exception events.

Persist provider, event timestamp, retrieval timestamp, and source reference.

Never fabricate delivery confirmations or claim to have verified a carrier event when the provider is unavailable.

### Agent 6 — Deterministic Decision and Desk Routing Arbiter

Implement a versioned, testable decision engine.

Apply the following order of precedence:

1. **Ledger integrity:** No payout without a verified transaction and sufficient refundable balance.
2. **Policy eligibility:** Apply the actual applicable policy, including defective-product and legal exceptions.
3. **Evidence and risk:** Evaluate product identity, defect evidence, logistics contradictions, claim velocity, and amount thresholds.
4. **Authorization:** Verify that the current user has the correct permissions for the requested action.
5. **Settlement readiness:** Confirm that all prerequisites for a refund have been satisfied.

#### CS-1 — Fast-Track Auto-Approval

Eligible only when all required conditions are satisfied:

- Transaction and refundable balance are verified.
- The return or defect claim is eligible under the applicable policy.
- Product identity is sufficiently verified.
- The relevant defect or return condition is adequately supported.
- Evidence is authentic enough for the configured assurance level.
- No unresolved material contradiction or mandatory review flag exists.
- The requested amount is within the configured automatic settlement limit.
- All other merchant-specific eligibility requirements pass.

CS-1 may propose or authorize a refund according to explicit merchant configuration. The finance authorization controls must remain independent of the agent's decision.

#### CS-2 — Exceptions and Evidence Inspection

Route cases here when:

- Product identity is uncertain.
- The claimed defect is not sufficiently visible.
- Image quality prevents a reliable assessment.
- A product variant, color, size, model, or SKU mismatch is suspected.
- A defect is potentially present but cannot be established confidently.
- The customer provides insufficient evidence.
- Carrier information conflicts with the claim.
- The claim exceeds the automatic settlement threshold.
- Risk indicators require supervisory review.
- A vision model and structured evidence produce conflicting results.

CS-2 must provide a specific reason, required additional evidence, reviewer checklist, and permitted next actions.

#### CS-3 — Denial or Policy-Ineligible Review

Route here when an authoritative, applicable rule establishes ineligibility, such as a confirmed duplicate refund or a non-refundable transaction under the governing policy.

Distinguish a final denial from an unresolved investigation.

A suspected fraud flag, ambiguous image, failed API call, or uncertain product match must not automatically become a final denial.

Store machine-readable reason codes, supporting evidence, policy versions, reviewer overrides, and customer-facing explanations.

### Agent 7 — Product Identity and Visual Defect Verification

This is a critical component. Implement it as two separate but coordinated evaluations.

#### A. Product Identity Verification

Compare the actual product purchased against the customer's submitted evidence.

Use available authoritative references:

- SKU and product catalog.
- Brand, model, product family, color, size, and variant.
- Merchant product images.
- Order line item and quantity.
- Packaging, labels, serial numbers, barcodes, or model identifiers where available.
- Customer-submitted images and video frames.
- Previously recorded evidence from the same order, where permitted.

For a bag refund, RITOS must verify whether the image depicts the bag model, color, and variant that were actually purchased.

Where sufficient reference images exist, compare visual features using a suitable image embedding or vision model and corroborating product metadata.

Use a configurable similarity threshold established through validation on representative product data. Do not use an arbitrary similarity score as definitive proof of identity.

Account for lighting, background, camera angle, image cropping, packaging, legitimate product variations, and image quality.

If the image shows a different model, classify the result as a potential mismatch and request clarification or manual inspection.

If the model or variant cannot be established, return `identity_status = "inconclusive"` instead of assuming the product matches.

#### B. Defect-Specific Evidence Verification

The system must evaluate whether the uploaded evidence actually supports the customer's stated reason.

For example:

**Purchase:** A specific handbag from the merchant's product catalog.

**Claim reason:** Loose stitching on the handle.

**Required analysis:**

1. Verify that the submitted image appears to depict the purchased handbag.
2. Identify the handle and relevant seam.
3. Determine whether the claimed stitching area is visible and sufficiently detailed.
4. Look for observable indicators such as separated stitches, an open seam, fraying, detached thread, torn material, or structural separation.
5. Distinguish visible defect evidence from normal stitching patterns, shadows, decorative seams, and image artifacts.
6. Determine whether the evidence supports the claimed defect, contradicts it, or is inconclusive.
7. Request a close-up image if the stitching cannot be inspected.
8. Compare with catalog or reference images when appropriate, without assuming that normal product variation proves a defect.
9. Record the exact evidence references and visual findings used.
10. Route unresolved cases to CS-2.

Repeat this defect-specific workflow for:

- Cracked electronics screens or housings.
- Torn clothing.
- Broken zippers.
- Loose stitching on bags or footwear.
- Missing buttons or accessories.
- Damaged packaging.
- Broken glassware.
- Incorrect product or variant.
- Missing components.
- Water damage, deformation, and visible manufacturing defects.

Do not assume that every product category can be assessed using the same image features or thresholds.

#### C. Image Processing and Semantic Vision

Implement a configurable pipeline using Pillow, NumPy, and OpenCV where appropriate, together with an actual configured vision model for semantic comparison.

Possible processing steps include:

- File signature and MIME validation.
- Image decoding and safe size limits.
- Resolution, blur, exposure, and occlusion checks.
- Image entropy and histogram analysis.
- Edge and texture analysis.
- Relevant-region detection or segmentation.
- Product identity comparison.
- Defect-region localization.
- Duplicate and near-duplicate image detection.
- EXIF and available provenance metadata inspection.
- OCR for labels, SKU markings, and serial numbers where appropriate.

Classical computer vision may support crack, tear, and seam analysis, but it must not be represented as a complete semantic understanding system.

Sobel edges, Laplacian variance, image entropy, and histogram statistics are supporting signals only. They cannot independently establish that a bag has loose stitching or that an image depicts the correct product.

Metadata absence is not proof of tampering. Metadata can legitimately disappear through messaging applications, image editing, or device settings.

Image manipulation indicators must be treated as risk signals requiring corroboration, not conclusive fraud evidence.

#### D. Structured Visual Verification Result

Return a typed result with fields such as:

- `product_identity_status`
- `matched_sku`
- `matched_model`
- `variant_match`
- `identity_confidence`
- `claimed_defect`
- `observed_defects`
- `defect_location`
- `defect_evidence_refs`
- `evidence_quality`
- `contradictions`
- `tamper_indicators`
- `verification_status`
- `confidence`
- `recommended_next_step`
- `model_version`
- `processing_timestamp`

Use explicit states such as `verified`, `mismatch`, `inconclusive`, `not_assessable`, and `processing_failed`.

Confidence must be calibrated and validated against labeled evaluation data. If the system has no calibrated confidence model, report the relevant raw score or qualitative assessment without presenting it as a probability.

Do not invent a confidence percentage or claim that a model has been validated when it has not.

### Agent 8 — Customer Resolution and Governance Communicator

Generate customer-facing messages based on actual case status.

Messages must distinguish:

- Refund approved.
- Refund proposed and awaiting financial approval.
- Evidence required.
- Product identity verification required.
- Manual inspection pending.
- Refund rejected under a specific policy.
- Gateway settlement initiated.
- Gateway settlement confirmed.
- Gateway settlement failed or remains pending.

Include the reason, required next action, applicable deadline where configured, and expected timeline based on actual gateway or merchant SLA data.

Never tell a customer that money has been refunded when only an internal approval exists.

Support configurable localization, accessible language, message templates, and communication audit logs.

### Agent 9 — Human Review and Governance Coordinator

Provide a structured case-review workflow that supports:

- Reviewer assignment.
- Evidence inspection.
- Supervisor approval.
- Finance approval.
- Requests for additional customer evidence.
- Decision overrides with mandatory reason codes.
- Escalation and reassignment.
- Separation of duties.
- Review SLA tracking.
- Complete audit history.

Human review must not bypass ledger validation, payment limits, authorization, or idempotency.

---

## 5. Advanced Product Evidence Workflow

Implement a dedicated evidence lifecycle.

### Evidence states

`uploaded → validated → identity_checked → defect_checked → adjudicated`

Alternative outcomes:

`rejected_file`, `inconclusive`, `awaiting_customer`, `awaiting_review`, `processing_failed`.

### Upload requirements

- Support multipart uploads and base64 payloads only where necessary.
- Validate actual file signatures rather than trusting filenames.
- Enforce configurable file-size, pixel-count, and supported-format limits.
- Prevent decompression bombs and malformed-image crashes.
- Strip or protect sensitive metadata from public display.
- Store evidence in private object storage or an appropriately secured local development store.
- Persist cryptographic hashes, storage references, timestamps, uploader IDs, and access records.
- Never expose private evidence through unrestricted public URLs.
- Apply malware scanning and retention policies where appropriate.
- Preserve an auditable original when required by the merchant's evidence policy.

### Evidence sufficiency

The system must determine whether the available evidence is adequate for the specific claim, not simply whether an image exists.

For a loose-stitching claim, for example, it may require:

- One full-product image.
- One close-up of the claimed stitching.
- One image showing the relevant handle, strap, or seam in context.
- A product identifier or other evidence of model identity when the catalog comparison is ambiguous.

Configure requirements by claim type and product category.

When evidence is missing or insufficient, return a precise evidence request rather than fabricating a negative finding.

### Reference-image comparison

Support comparison against:

- Merchant catalog photographs.
- Stored SKU reference images.
- Product variant images.
- Order-specific packing evidence where available.
- Relevant carrier or return-inspection photographs.

Do not assume catalog photographs represent the exact physical unit shipped. Distinguish model identity from individual-unit identity.

### Evidence security

Treat image contents, OCR output, EXIF fields, embedded text, QR codes, and any extracted metadata as untrusted input.

Do not allow uploaded content to execute code, modify policies, instruct agents, or override authorization rules.

---

## 6. Financial Settlement Engine — `backend/app/finance.py`

Implement a financial settlement service with strict segregation of duties.

### Authorization

- Customer support agents may propose refunds.
- Adjudication agents may recommend decisions.
- Authorized supervisors may approve exceptions within configured limits.
- Only users with the configured `finance_approver` or `administrator` role may execute financial settlements.
- A user must not approve their own proposal where the four-eyes policy prohibits self-approval.
- Enforce permissions on the backend for every settlement operation.

### Double-entry ledger

Create a dedicated immutable `ledger_entries` table or equivalent append-only accounting journal.

Each posted refund journal must contain balanced debit and credit entries in the same currency, with explicit accounting mappings for the merchant's configured accounting model.

For example, a simplified captured-payment refund may debit a refund liability or contra-revenue account and credit a processor clearing or cash account, depending on the actual accounting policy.

Do not hardcode one accounting treatment as universally correct. Configure the chart of accounts and obtain finance approval for the mapping.

Validate that total debits equal total credits for every posted journal.

Record:

- Journal ID.
- Refund ID.
- Order and transaction references.
- Currency.
- Debit and credit account identifiers.
- Amounts in integer minor currency units.
- Actor and approver IDs.
- Idempotency key.
- Gateway request and response references.
- Posting timestamp.
- Reversal or correction references.

Never edit or delete posted journal entries to conceal errors. Use compensating entries.

### Idempotency and duplicate protection

Implement an idempotency mechanism using the `Idempotency-Key` request header, persisted database constraints, and an appropriate request fingerprint.

Support deterministic UUIDv5 keys where a stable namespace and canonical input are appropriate.

A repeated request with the same key and same payload must return the original result rather than initiating another payout.

The same key with a different payload must be rejected.

Use unique constraints, atomic state transitions, and transaction isolation to prevent duplicate settlement under concurrency.

### Gateway integration

Use the configured payment gateway's actual refund API.

Implement:

- Provider-specific adapters.
- Authentication through environment-managed secrets.
- Timeouts and bounded retries.
- Provider idempotency support where available.
- Durable settlement state.
- Webhook signature verification.
- Webhook replay protection.
- Gateway reconciliation.
- Failed and pending settlement recovery.
- Compensating journal entries when needed.

A timeout after sending a refund request must not trigger a blind second payout. Reconcile the provider's actual state first.

Keep the internal refund lifecycle separate from the gateway lifecycle:

`proposed → adjudicated → awaiting_finance → authorized → settlement_pending → settled`

Alternative states:

`rejected`, `settlement_failed`, `reconciliation_required`, `reversed`.

A successful API response is not automatically equivalent to confirmed bank receipt. Display the exact level of confirmation the provider supplies.

---

## 7. Database and Data Integrity

Inspect existing models and implement migrations for any missing entities.

Required logical entities include:

- Users and roles.
- Customers.
- Products and product variants.
- Product reference images.
- Orders and order line items.
- Payment transactions.
- Refund requests.
- Refund reservations.
- Evidence files and verification results.
- Versioned return policies.
- Agent execution records.
- Risk signals.
- Carrier events.
- Human reviews and approvals.
- Audit logs.
- Ledger accounts.
- Ledger journals and entries.
- Gateway settlement attempts.
- Idempotency records.
- Notification records.
- Integration health and operational events.

Add appropriate foreign keys, unique constraints, indexes, timestamp fields, status transitions, and tenant isolation if the platform supports multiple merchants.

Use integer minor units for financial amounts and explicit currency codes.

Use UTC-aware timestamps.

Prevent invalid state transitions at the service and database layers wherever possible.

Do not treat an in-memory dictionary or a frontend state variable as the authoritative financial record.

---

## 8. Real-Time Processing and Automation

Build a durable event-driven workflow where the existing stack permits it.

Example events:

- `refund.created`
- `transaction.verified`
- `policy.evaluated`
- `evidence.uploaded`
- `product.identity_verified`
- `defect.assessment_completed`
- `risk.assessed`
- `refund.routed`
- `review.requested`
- `refund.finance_approved`
- `settlement.initiated`
- `settlement.confirmed`
- `settlement.failed`
- `reconciliation.required`

Use a transactional outbox or an equivalent reliable delivery mechanism for events generated from database transactions.

Implement retry policies, dead-letter handling, deduplication, and recovery for interrupted workflows.

Use server-sent events or WebSockets for live dashboard updates if appropriate.

Never use simulated live activity as a substitute for real processing events.

Automation must include:

- Automated evidence intake.
- Deterministic policy evaluation.
- Automated low-risk case routing.
- Customer evidence requests.
- Reviewer assignment.
- Finance approval queues.
- Settlement status tracking.
- Gateway reconciliation.
- SLA escalation.
- Retry and failure recovery.
- Operational alerts.

External actions, including sending emails, issuing refunds, or changing customer records, must be authorized, auditable, and idempotent.

Use actual provider adapters. If credentials or provider access are missing, expose an explicit unavailable integration state and actionable setup instructions.

---

## 9. Role-Based Dashboards

Implement functional dashboards using real backend data.

### Customer dashboard

- Refund request submission.
- Order and refund history.
- Evidence upload.
- Evidence requirements and status.
- Requests for additional information.
- Current adjudication and settlement status.
- Customer communications.

### Customer support dashboard

- Refund ticket queue.
- Search and filtering.
- Transaction and policy verification.
- Evidence viewer.
- Product identity and defect assessment.
- Customer communication tools.
- CS-1, CS-2, and CS-3 routing explanations.
- Proposal and escalation actions.

### Supervisor dashboard

- Exception review.
- High-value claim approvals.
- Evidence disputes.
- Reviewer workload.
- Policy overrides with mandatory reasons.
- Fraud investigation queues.
- SLA and escalation monitoring.

### Finance dashboard

- Authorized settlement queue.
- Four-eyes approval controls.
- Double-entry journal viewer.
- Gateway settlement status.
- Failed settlement recovery.
- Reconciliation discrepancies.
- Duplicate settlement prevention.
- Exportable financial reports.

### Administrator dashboard

- Users and role management.
- Policy configuration and versioning.
- Product catalog integrations.
- Carrier and payment gateway configuration.
- Audit logs.
- Job and queue health.
- Integration health.
- Model version and evaluation metrics.
- System configuration and operational alerts.

Every dashboard must have working navigation, functional controls, server-side pagination, appropriate access control, loading states, error states, and empty states.

Never display fabricated revenue, refund counts, processing times, or accuracy metrics.

---

## 10. API Contracts and Operational Reliability

Create or update typed API endpoints for:

- Authentication and authorization.
- Refund creation and retrieval.
- Transaction verification.
- Product catalog lookup.
- Evidence upload and retrieval.
- Product identity assessment.
- Defect verification.
- Policy evaluation.
- Risk assessment.
- Decision orchestration.
- Manual review.
- Finance approval.
- Settlement execution.
- Gateway reconciliation.
- Audit history.
- Operational health.

Use consistent error schemas and appropriate HTTP status codes.

Validate all external input. Apply authentication, rate limiting, authorization checks, request-size limits, secure secret management, and structured logging.

Implement request correlation IDs so a single refund can be traced through the API, agents, database, queue, gateway, and accounting journal.

Provide a readiness endpoint that checks critical dependencies separately from basic process liveness.

A database outage, unavailable vision provider, or gateway failure must be visible to operators and must not result in a fabricated successful response.

---

## 11. Deterministic Decisions and AI Boundaries

Use AI only where semantic interpretation or visual recognition is necessary.

Use conventional code and database constraints for:

- Refundable balance calculations.
- Policy-window arithmetic.
- Role authorization.
- Refund thresholds.
- Idempotency.
- Accounting balance validation.
- Duplicate prevention.
- State transitions.
- Final routing precedence.

AI or vision models may assist with:

- Product image similarity.
- Defect localization.
- Customer claim classification.
- OCR and semantic interpretation.
- Evidence sufficiency assessment.

Model outputs must be validated against strict schemas and stored with model identifiers and reproducible processing inputs.

The same persisted inputs, policy version, rule configuration, and deterministic rule-engine version must produce the same routing result.

If an external model is nondeterministic, preserve its result as a recorded evidence assessment and ensure that routing from the persisted assessment is deterministic.

Do not claim that a visual model can prove authenticity, detect all manipulation, or determine customer intent with certainty.

Do not train or deploy a custom model without a documented dataset, training process, evaluation results, and reproducible model artifact.

---

## 12. Automated Testing and Release Gates

Create meaningful pytest suites covering:

### Ledger and policy

- Valid transaction and sufficient balance.
- Missing transaction.
- Currency mismatch.
- Duplicate refund.
- Exhausted refundable balance.
- Concurrent refund requests.
- Expired return window.
- Product-specific policy exception.
- Incorrect delivery timestamps.

### Product identity and vision

- Correct product and variant.
- Wrong model or color.
- Bag with visibly loose stitching.
- Bag with normal stitching.
- Defect located outside the claimed area.
- Blurry or poorly lit close-up.
- Missing reference images.
- Insufficient product-identifying evidence.
- Unrelated product image.
- Blank or uniform image.
- Corrupt image.
- Oversized image.
- Repeated image upload.
- Valid metadata absence.
- Suspicious image provenance.
- Vision provider timeout.
- Low-confidence assessment routed to review.

Use labeled evaluation fixtures and representative product imagery. Synthetic fixtures are acceptable in tests when explicitly identified as test data; they must never masquerade as production evidence.

### Decision routing

- Eligible low-risk refund.
- High-value refund routed to CS-2.
- Product identity mismatch.
- Defect evidence inconclusive.
- Confirmed duplicate refund.
- Policy-ineligible request.
- Carrier contradiction.
- Risk flag requiring review.
- Provider outage.
- Human override with audit trail.

### Financial settlement

- Unauthorized finance action rejected.
- Four-eyes separation enforced.
- Balanced double-entry journal.
- Repeated idempotency key.
- Same key with a different payload.
- Concurrent settlement attempts.
- Gateway timeout after request submission.
- Webhook replay.
- Failed settlement reconciliation.
- Compensating reversal entries.
- Exact accounting balance maintained.

### Frontend

- Authentication and role permissions.
- Evidence upload and preview.
- Refund case status updates.
- Decision explanation rendering.
- Finance approval workflows.
- API failure and retry states.
- Responsive dashboard behavior.

Use a real PostgreSQL test environment for integration tests involving locking, transactions, constraints, and concurrent financial operations.

Run the actual backend test suite and frontend production build.

Required release gates:

- `pytest -q`
- Frontend `npm run build`
- Type checking and configured linting.
- Database migration validation.
- Security checks.
- API integration tests.
- Settlement invariants.
- Dependency and configuration checks.

Do not report success if a command was not executed or if tests were skipped. Clearly separate passed, failed, skipped, and blocked checks.

---

## 13. Deployment and Production Readiness

Provide:

- Environment templates containing placeholders only.
- Docker and Compose configuration where appropriate.
- Database migration instructions.
- Worker startup instructions.
- Frontend build and deployment configuration.
- API and worker health checks.
- Structured logging and audit retention.
- Monitoring and alerting guidance.
- Backup and restore instructions.
- Secret rotation guidance.
- Integration setup instructions.
- Incident recovery procedures.
- Rollback instructions.

Do not commit real API keys, passwords, tokens, payment credentials, private customer information, or production database dumps.

Use a staging environment and payment-gateway sandbox before enabling live payouts.

Live financial settlement must remain disabled until credentials, accounting mappings, approval permissions, webhook verification, reconciliation, and release checks have been verified.

---

## 14. Required Engineering Deliverables

At completion, provide:

1. A summary of the original repository state.
2. A list of implemented files and architectural changes.
3. Database migrations and schema changes.
4. Typed agent contracts and orchestration logic.
5. Working product identity and defect verification workflows.
6. Working evidence storage and review flows.
7. Deterministic policy and routing implementation.
8. Double-entry accounting and settlement controls.
9. Real provider integration status, including anything awaiting credentials.
10. Functional role-based frontend workflows.
11. Automated tests and actual test results.
12. Frontend build and lint results.
13. Environment setup instructions.
14. Local development and deployment commands.
15. Known limitations, unresolved defects, and operational risks.
16. A release-readiness checklist distinguishing verified functionality from planned work.

### Final execution instruction

Start by inspecting the existing repository and current Git state. Then implement the system incrementally, preserving working code and protecting existing history.

Do not stop after producing a plan. Implement the highest-priority working components, run the relevant tests, fix regressions, and continue until the defined release gates pass or a specific external dependency blocks progress.

**Definition of success:** RITOS can accept a real refund request, reconcile it against actual records, compare submitted evidence against the purchased product and claimed defect, produce an explainable and reproducible routing decision, enforce human and financial authorization, and execute or track a properly accounted refund without duplicate settlement.

Never claim production readiness, verified accuracy, successful payment execution, or complete automation unless supported by actual execution evidence.


### Additional Mandatory Enterprise Requirements

Implement a comprehensive, versioned refund policy engine; jurisdiction-aware legal and consumer-rights rules; warranty and defective-product exceptions; refund appeals; customer evidence resubmission; reviewer independence; SLA enforcement; operational monitoring; disaster recovery; database backup and restore verification; privacy and data-retention controls; accessibility; rate limiting; abuse prevention; integration health monitoring; and complete financial reconciliation.

Every refund decision must include a machine-readable decision trace identifying the transaction facts, applicable policy version, product identity result, defect evidence result, risk findings, reviewer actions, routing rules, and final outcome.

Maintain a strict distinction between verified facts, model-generated assessments, unresolved uncertainty, policy violations, and confirmed fraud. Never use an uncalibrated vision score or unexplained AI output as the sole basis for a high-impact denial.

Implement customer appeals and independent review, including additional evidence submissions and immutable decision history. Apply jurisdiction-specific legal requirements only from validated, maintained sources; do not invent legal citations or assume merchant policy overrides statutory rights.

Build reliable background processing, transactional event delivery, bounded retries, dead-letter handling, reconciliation scheduling, actionable alerts, structured observability, and recoverable failed workflows.

Require real integration adapters and explicit provider configuration for payment gateways, carriers, email, storage, and vision services. Include sandbox tests, provider health checks, webhook signature verification, timeout recovery, and duplicate-event protection.

Enforce tenant isolation where applicable, least-privilege access, secure file storage, sensitive-data minimization, retention and deletion policies, secret rotation, dependency security checks, and documented incident response.

Do not declare RITOS production-ready until automated tests, concurrency tests, accounting invariants, security checks, integration tests, database migration checks, frontend build, backup restoration, and gateway sandbox settlement have been verified. Provide a feature-by-feature verification report identifying implemented, tested, blocked, and incomplete functionality.