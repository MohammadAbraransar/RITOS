# RITOS Demo Walkthrough

1. Start the backend and frontend as described in README.
2. Sign in as `customer@ritos.local`.
3. Submit a ticket using `TXN-1001`, amount `1500`, currency INR. Try descriptions such as “My refund has not arrived” or “I did not make this payment”.
4. Observe category, priority, payment verification, recommended action and queue in ticket details.
5. Submit the same issue again to observe the conservative duplicate link.
6. Sign out and sign in as `agent@ritos.local`; inspect queue, add an internal note and escalate a case.
7. Sign in as `refunds@ritos.local`; create a refund request against a verified ticket.
8. Sign in as `finance@ritos.local`; approve or reject the pending request. The requester and approver must be different users.
9. Sign in as `refunds@ritos.local`; execute an approved request using the mock provider.
10. Inspect refund status and audit events as an authorized auditor/admin.
11. Confirm the UI labels the provider as mock and does not imply real money movement.
