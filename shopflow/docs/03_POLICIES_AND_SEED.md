# 03: Products, Refund Policies and Seed Scenarios

Currency INR. Prices below are in rupees; store as paise. Dates in seed data are **relative to seed time** (`now - N days`) so scenarios stay valid whenever you seed.

## 1. Catalog (15 products) and structured policies

`HV` = human approval threshold ₹50,000 (applies when the order amount meets or exceeds it).

| ID | Product | Cat | Price ₹ | Type | % | Window | Key rules |
|---|---|---|---|---|---|---|---|
| PROD-001 | Nimbus Wireless Headphones | Audio | 2,999 | FULL | 100 | 30d | opened ok; defective ok; evidence for DAMAGED/WRONG_PRODUCT; free return shipping; replacement ok |
| PROD-002 | Orbit X5 Smartphone | Mobile | 32,999 | FULL | 100 | 14d | return required; verification IMEI; evidence for DAMAGED/DEFECTIVE; customer-caused damage may be rejected |
| PROD-003 | Atlas Pro 14 Laptop | Computers | 68,999 | FULL_HIGH_VALUE | 100 | 15d | verification SERIAL; physical damage -> human review; HV threshold applies |
| PROD-004 | Stride Run Shoes | Footwear | 4,499 | PARTIAL | 80 | 30d | requires_unused=true; worn = non-refundable; evidence for WRONG_PRODUCT |
| PROD-005 | BrewMate Coffee Maker | Home | 3,999 | PARTIAL | 90 | 30d | opened ok; evidence for DAMAGED |
| PROD-006 | Lumo Smart Bulb (4-pack) | Smart Home | 1,299 | FULL | 100 | 30d | defective accepted; no evidence needed for DEFECTIVE |
| PROD-007 | VoltMax 20000mAh Power Bank | Accessories | 1,799 | NON_REFUNDABLE_AFTER_OPEN | 100 if unopened | 30d | opened = non-refundable; exception defective_on_arrival (review) |
| PROD-008 | Custom Engraved Backpack | Bags | 2,499 | NON_REFUNDABLE | 0 | 0d | personalized; exception manufacturing_defect only (evidence required) |
| PROD-009 | CloudVault 1-Year Storage | Digital | 999 | NON_REFUNDABLE | 0 | 0d | digital; exception duplicate_billing only |
| PROD-010 | EchoGo Speaker (Clearance) | Audio | 1,499 | EXCHANGE_ONLY | 0 | 15d | clearance; exchange only; exception defective (replace/refund with evidence) |
| PROD-011 | Pulse Smart Watch S2 | Wearables | 8,999 | FULL_SHORT_WINDOW | 100 | 7d | refund only within 7 days; evidence for DAMAGED |
| PROD-012 | KeyForge Mechanical Keyboard | Peripherals | 5,499 | DEFECTIVE_ONLY | 100 | 30d | refund only if defective/damaged with evidence; changed-mind not refundable |
| PROD-013 | Viper Gaming Mouse | Peripherals | 2,299 | FULL | 100 | 30d | evidence required for DAMAGED/DEFECTIVE |
| PROD-014 | ViewMax 27" Monitor | Displays | 18,999 | FULL | 100 | 10d | evidence required for DAMAGED/DEFECTIVE (dead pixels, cracks); return required |
| PROD-015 | Slate Tab 11 Tablet | Tablets | 54,999 | FULL_HIGH_VALUE | 100 | 14d | HV threshold applies (always >= threshold); serial verification |

Seed 5-12 stock units each (PROD-010 stock 3). Use placeholder images (`/images/products/<id>.jpg`, generated SVG/gradient placeholders are acceptable). Each product has 4-6 specs in `specs` jsonb.

## 2. Customers (password for all: `Demo@1234`)
| ID | Name | Notes |
|---|---|---|
| CUS-10001 | Aarav Mehta | primary demo customer, account 420 days, clean history |
| CUS-10002 | Diya Nair | account 300 days, one past partial refund |
| CUS-10003 | Rohan Iyer | account 150 days |
| CUS-10004 | Sneha Reddy | account 600 days, loyal, 2 clean refunds |
| CUS-10005 | Karthik Rao | account 90 days |
| CUS-10006 | Meera Joshi | account 200 days, duplicate scenario owner |
| CUS-10007 | Vikram Singh | account 500 days, high-value buyer |
| CUS-10008 | Ananya Das | account 45 days |
| CUS-10009 | Kabir Shah | **suspicious pattern**: account 12 days, 5 refund tickets in 14 days, `risk_metadata.manual_watchlist=false`, several different addresses |
| CUS-10010 | Isha Kapoor | account 250 days |
Staff: `support@shopflow.test` (SUPPORT_ANALYST), `admin@shopflow.test` (ADMIN), same password.

## 3. Orders and tickets: scenario map (the 10 required scenarios)

Seed >= 25 orders total (the rows below plus ordinary delivered/shipped/pending orders for variety). "Expected" is what a sensible RITOS should decide and what `MOCK_RITOS` must return. It is not enforced by ShopFlow.

| # | Ticket | Customer | Product | Order facts | Claim | Expected |
|---|---|---|---|---|---|---|
| 1 | RIT-2026-000100 | 10001 | PROD-001 | delivered 4d ago, ₹2,999 | PRODUCT_DAMAGED, 1 image, FULL_REFUND | APPROVED 100%, conf ~0.96 |
| 2 | RIT-2026-000102 | 10002 | PROD-005 | delivered 6d ago, ₹3,999 | PRODUCT_DEFECTIVE, image, FULL_REFUND | PARTIALLY_APPROVED 90% (₹3,599) |
| 3 | RIT-2026-000104 | 10003 | PROD-008 | delivered 5d ago | CHANGED_MIND, FULL_REFUND | REJECTED (non-refundable, no exception) |
| 4 | RIT-2026-000106 | 10004 | PROD-004 | delivered 45d ago | CHANGED_MIND | REJECTED (outside 30d window) |
| 5 | RIT-2026-000108 | 10007 | PROD-003 | delivered 3d ago, ₹68,999 | PRODUCT_DEFECTIVE, image | HUMAN_REVIEW (high value) |
| 6 | RIT-2026-000110 | 10005 | PROD-002 | delivered 5d ago | PRODUCT_DAMAGED, **no evidence** | HUMAN_REVIEW (evidence required, missing) |
| 7 | RIT-2026-000112 | 10006 | PROD-013 | delivered 8d ago; **RIT-2026-000111 already REFUNDED** for the same transaction | PRODUCT_DEFECTIVE again | REJECTED / flag duplicate |
| 8 | RIT-2026-000114 | 10008 | PROD-006 | order status DELIVERED | ORDER_NEVER_ARRIVED | HUMAN_REVIEW (claim conflicts with delivery data) |
| 9 | RIT-2026-000116 | 10009 | PROD-011 | delivered 2d ago; account 12d old; 5 tickets in 14d | PRODUCT_DEFECTIVE, no evidence | HUMAN_REVIEW (suspicious pattern) |
| 10 | RIT-2026-000118 | 10010 | PROD-012 | delivered 3d ago | WRONG_PRODUCT, image | APPROVED 100% |

Seed these as `PENDING_RITOS` (the **inputs**), except where a prior ticket must be completed (000111).

Additional seeded history (so the dashboards and `refund_history` are populated):
- **Completed refunds (6+):** RIT-2026-000090..000095, status REFUNDED with `refund_transactions` SUCCESS (mix of FULL and PARTIAL, includes 10004's two clean refunds, 10002's partial, and 000111 for the duplicate scenario).
- **Rejected (3+):** past rejections with reasons (outside window, non-refundable).
- **Duplicate scenarios (2):** (a) 000111 REFUNDED then 000112 pending (above). (b) CUS-10007 PROD-014 monitor: 000097 REFUNDED, 000120 PENDING_RITOS for the same transaction.
- **High-value orders (2+):** PROD-003 and PROD-015 orders.
- **Outside-window orders (2+):** scenario 4 plus one PROD-011 delivered 12d ago (7d window).
- **Missing-evidence tickets (2+):** scenarios 6 and 9.
- **Spread of order statuses:** a few PENDING/PROCESSING/SHIPPED/OUT_FOR_DELIVERY/CANCELLED orders for the admin demo.
- **Reserve ticket numbering:** the Postgres sequence must be set so that the **next** ticket created through the UI is `RIT-2026-000123`.

Evidence files for seeded tickets: generate small placeholder images in `uploads/seed/` and register them in `refund_evidence`.

## 4. MOCK_RITOS behavior (`src/server/mock-ritos/`)
A deterministic rules function `mockDecide(context) -> decision payload`, applied through the same `POST /api/ritos/refund-decision` path as the real thing (so ShopFlow's real validation, idempotency and state machine are exercised). Order of rules:
1. `related_tickets` has a REFUNDED/in-flight ticket on the same transaction and ledger remaining = 0 -> `REJECTED`, reason "Refund already issued for this transaction", conf 0.97.
2. `claim_data_conflicts` non-empty -> `HUMAN_REVIEW`, conf 0.55.
3. Customer fits suspicious pattern (`refund_tickets_30d >= 4` and `account_age_days < 30`) -> `HUMAN_REVIEW`, conf 0.40.
4. `above_high_value_threshold` or policy HV applies -> `HUMAN_REVIEW`, conf 0.80.
5. `evidence_required` and `evidence_count == 0` -> `HUMAN_REVIEW`, conf 0.60.
6. Non-refundable policy and no matching exception for the reason -> `REJECTED`, conf 0.95.
7. `within_return_window == false` -> `REJECTED`, conf 0.95.
8. Exchange-only policy and requested FULL_REFUND without a defect exception -> `REJECTED`, conf 0.90.
9. `defective_only` and reason not in (DEFECTIVE, DAMAGED, WRONG_PRODUCT) -> `REJECTED`, conf 0.92.
10. policy percentage < 100 -> `PARTIALLY_APPROVED` at policy % of the item price, conf 0.93.
11. otherwise -> `APPROVED` 100%, conf 0.96.
Add a 300-1500 ms artificial delay and a trace (`agent_trace`) with fake per-agent outputs so the admin RITOS page looks realistic. Mark every record produced this way `processed_by: "MOCK_RITOS"`.

Confidence below 0.90 on an approval must route to `HUMAN_REVIEW` (matches the architecture's "< 90% -> human" rule); the mock never emits that, but the rule is documented for the real RITOS.

## 5. Dev helper: tiny RITOS client script
`scripts/ritos-client.ts`: given a ticket id, GETs the context with the API key, prints it, and (flag `--decide`) posts a decision and then calls `/api/payments/refund`. This lets you test the contract without any RITOS code.
