# RITOS — Release verification report

Release: **RITOS White-First Refinement Candidate 1.0.1**

## Checks run in this environment

| Check | Result | Evidence / limits |
|---|---|---|
| Backend unit suite | PASS | `python -m pytest -q` — 9 passed |
| Python syntax compilation | PASS | `python -m compileall -q app` |
| ZIP integrity | PASS | `ZipFile.testzip()` returned no corrupt member after packaging |
| Production configuration guard | Added | Startup rejects default/short JWT secret, SQLite, and wildcard CORS when `APP_ENV=production`; live deployment not run |
| Refund execution controls | Refined | PostgreSQL row locks, remaining-balance recheck, and approver/executor separation-of-duties check; real gateway and concurrency stress tests still required |
| Sign-in design | Refined | White-first enterprise styling; development account selector/password guidance is only rendered in Vite development mode |
| API status indicator | Refined | UI reports connected/degraded after API-backed workspace load rather than always claiming systems are operational |
| Frontend unit tests | PASS ON USER MACHINE | User-provided terminal log: 2 Vitest tests passed. |
| Frontend production build | FIX APPLIED; RE-RUN REQUIRED | Changed TypeScript target and library from ES2020 to ES2021 to support `String.replaceAll`; the build must be rerun after dependencies are installed. |
| Live Render/Vercel deployment | NOT RUN | Requires user-owned accounts, deployed domains and environment configuration |
| Real payment provider | NOT INTEGRATED | Refund adapter is mock-only; it does not move money |

## Important production blockers

This artifact is a staging/demo release candidate, not a certified production payment system. Before real financial use, complete and evidence all of the following:

1. Successful CI frontend install, Vitest, TypeScript and Vite production build.
2. Replace startup `Base.metadata.create_all` with reviewed Alembic migrations and verify upgrades/rollback on a disposable PostgreSQL database.
3. Add durable ecommerce event IDs and replay/delivery deduplication; verify signature/secret rotation and retries.
4. Implement the actual payment provider adapter using its official idempotency contract; reconcile ambiguous timeouts without creating a second refund.
5. Add durable job dispatch/retries/dead-letter handling and verify worker behavior across process restarts.
6. Add full API/RBAC and browser end-to-end tests, including cross-customer access, duplicate payment vs duplicate ticket, concurrent refund requests, approval/execution separation, and webhook replay.
7. Complete a staging deployment, provider sandbox tests, secret review, backup/restore test, monitoring and independent security review.

## Financial safety policy

Classification, duplicate signals and risk flags do not authorize a refund. Transaction ownership and amount must be verified from a trusted source. Exceptions go to a human reviewer. Refund approval and execution are distinct actions. The mock adapter is not evidence of a real provider refund. Do not process real customer refunds with this artifact until the blockers above are closed.
