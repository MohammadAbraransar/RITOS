# Initial Threat Model

| Threat | Baseline mitigation | Remaining work |
|---|---|---|
| Customer reads another customer's ticket | API scopes customer list/detail by authenticated user | Automated IDOR tests across all endpoints |
| Unprivileged refund action | Server-side role dependencies | Formal permission matrix and pen test |
| Fake transaction claim | Transaction lookup uses DB record, not ticket prose | Replace synthetic adapter with trusted provider integration |
| Duplicate ticket leads to duplicate refund | Ticket duplicate link plus separate refund idempotency key | Transaction-level locking/unique refund obligation model under concurrent PostgreSQL load |
| Prompt injection in customer text | No LLM executes actions in this build | Add LLM only with strict structured output and tool allowlists |
| Provider timeout creates false success | Mock-only result; no real provider timeout behavior | Real adapter with reconciliation before retry |
| Password brute force | Password hash | Add distributed rate limit, lockout/alert policy |
| Token theft | Short-lived signed token | Refresh rotation/revocation, secure cookie deployment option |
| Malicious attachment | Uploads are not enabled | Add type/size limits, isolated storage and malware scan |
| Audit tampering | Application-level audit records | Database-level append-only permissions, tamper evidence and retention policy |
