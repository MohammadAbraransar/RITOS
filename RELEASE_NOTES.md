# RITOS 1.0.0 — White-First Refinement

## Included in this candidate
- White-first enterprise sign-in design with navy/blue accents, responsive layout and restrained visual hierarchy.
- Development-only workspace selector; production builds do not render development account shortcuts or default-password guidance.
- API connection indicator now reflects the result of API-backed workspace loading rather than permanently claiming the system is operational.
- Production startup guard rejects default/short JWT secrets, SQLite persistence and wildcard CORS configuration.
- Refund execution now locks the refund and transaction rows on PostgreSQL, rechecks the refundable balance, and prevents the approver from executing the same refund.
- Added AI automation policy documentation and repeatable local verification scripts for Windows and Unix-like systems.

## Important scope boundary
This is a refined staging/demo candidate. It is not a certified production payment platform. The payment adapter remains mock-only, the frontend build could not be verified in this environment because dependency installation timed out, and live deployment, webhook replay protection, explicit reviewed migrations, real gateway sandbox tests, durable worker recovery, and browser end-to-end/security tests remain open blockers. See `RELEASE_VERIFICATION.md`.
