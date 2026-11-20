"""Replace RITOS's demo data with the ShopFlow product catalog.

    python -m app.load_shopflow_catalog            import only (idempotent: existing rows are kept)
    python -m app.load_shopflow_catalog --reset    clear RITOS data first, then import

--reset deletes, in the RITOS schema only: tickets and everything hanging off them (comments, events, workflow runs,
evidence files and their stored photos, payouts, settlement attempts, ledger journals, outbox and inbound events,
audit log), orders (transactions, order items, carrier records) and the product catalog. It keeps user accounts,
return policies, the chart of accounts and all settings. ShopFlow's own database is not touched.

Import:
  * the 15 ShopFlow products (shopflow/prisma/seed-data/products.ts), keyed by ShopFlow's SKU and with the category
    upper-cased exactly as store claims arrive (e.g. "Smart Home" -> "SMART HOME"), so store and portal claims for
    the same item resolve to the same product;
  * their return rules as RITOS return policies: one per category, plus a per-product row ("SKU:<sku>") where a
    product's rules differ from its category's (the clearance speaker, the defective-only keyboard);
  * one paid order per product for the demo customer (customer@ritos.local), so each product can be claimed.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from .database import Base, SessionLocal, init_db
from .models import EvidenceFile, OrderItem, Product, ReturnPolicy, Ticket, Transaction, User

# Copied from shopflow/prisma/seed-data/products.ts (prices in paise). Categories upper-cased as store claims send them.
PRODUCTS = [
    {'shop_id': 'PROD-001', 'sku': 'AUD-WH-001', 'name': 'Nimbus Wireless Headphones', 'category': 'AUDIO', 'brand': 'Nimbus', 'description': 'Premium over-ear noise-cancelling wireless headphones with 40h battery life.', 'price_minor': 299900, 'policy_type': 'FULL', 'refund_percentage': 100, 'window': 30, 'defective_only': False, 'exceptions': ['defective_on_arrival'], 'verification': 'NONE', 'notes': 'Policy accepts damaged items with evidence'},
    {'shop_id': 'PROD-002', 'sku': 'MOB-X5-002', 'name': 'Orbit X5 Smartphone', 'category': 'MOBILE', 'brand': 'Orbit', 'description': '6.7-inch AMOLED 120Hz display, 50MP triple camera, 5000mAh battery.', 'price_minor': 3299900, 'policy_type': 'FULL', 'refund_percentage': 100, 'window': 14, 'defective_only': False, 'exceptions': [], 'verification': 'IMEI', 'notes': 'IMEI verification required upon return receipt'},
    {'shop_id': 'PROD-003', 'sku': 'CMP-AP14-003', 'name': 'Atlas Pro 14 Laptop', 'category': 'COMPUTERS', 'brand': 'Atlas', 'description': 'High-performance creator laptop with 14.2-inch Liquid Retina display and 16GB unified memory.', 'price_minor': 6899900, 'policy_type': 'FULL_HIGH_VALUE', 'refund_percentage': 100, 'window': 15, 'defective_only': False, 'exceptions': ['physical_damage_review'], 'verification': 'SERIAL', 'notes': 'High value laptop requiring serial number audit and human review'},
    {'shop_id': 'PROD-004', 'sku': 'FTW-SR-004', 'name': 'Stride Run Shoes', 'category': 'FOOTWEAR', 'brand': 'Stride', 'description': 'Lightweight cushioned marathon running shoes with breathable mesh upper.', 'price_minor': 449900, 'policy_type': 'PARTIAL', 'refund_percentage': 80, 'window': 30, 'defective_only': False, 'exceptions': [], 'verification': 'NONE', 'notes': 'Footwear requires unworn condition; 80% refund policy'},
    {'shop_id': 'PROD-005', 'sku': 'HOM-BM-005', 'name': 'BrewMate Coffee Maker', 'category': 'HOME', 'brand': 'BrewMate', 'description': 'Programmable 12-cup drip coffee maker with thermal stainless steel carafe.', 'price_minor': 399900, 'policy_type': 'PARTIAL', 'refund_percentage': 90, 'window': 30, 'defective_only': False, 'exceptions': [], 'verification': 'NONE', 'notes': 'Appliances returnable up to 90% refund with evidence'},
    {'shop_id': 'PROD-006', 'sku': 'SMH-LB-006', 'name': 'Lumo Smart Bulb (4-pack)', 'category': 'SMART HOME', 'brand': 'Lumo', 'description': '16 million colors RGBW Wi-Fi LED smart bulbs compatible with Alexa and Google Assistant.', 'price_minor': 129900, 'policy_type': 'FULL', 'refund_percentage': 100, 'window': 30, 'defective_only': False, 'exceptions': [], 'verification': 'NONE', 'notes': 'No evidence needed for defective smart bulbs'},
    {'shop_id': 'PROD-007', 'sku': 'ACC-VM-007', 'name': 'VoltMax 20000mAh Power Bank', 'category': 'ACCESSORIES', 'brand': 'VoltMax', 'description': 'Ultra-high capacity fast-charging power bank with 22.5W Power Delivery.', 'price_minor': 179900, 'policy_type': 'NON_REFUNDABLE_AFTER_OPEN', 'refund_percentage': 100, 'window': 30, 'defective_only': False, 'exceptions': ['defective_on_arrival'], 'verification': 'NONE', 'notes': 'Non-refundable once seal is broken unless defective on arrival'},
    {'shop_id': 'PROD-008', 'sku': 'BAG-CE-008', 'name': 'Custom Engraved Backpack', 'category': 'BAGS', 'brand': 'Artisan', 'description': 'Handcrafted water-resistant canvas laptop backpack personalized with custom laser engraving.', 'price_minor': 249900, 'policy_type': 'NON_REFUNDABLE', 'refund_percentage': 0, 'window': 0, 'defective_only': True, 'exceptions': ['manufacturing_defect'], 'verification': 'NONE', 'notes': 'Personalized item; non-refundable except for verified manufacturing defect'},
    {'shop_id': 'PROD-009', 'sku': 'DIG-CV-009', 'name': 'CloudVault 1-Year Storage', 'category': 'DIGITAL', 'brand': 'CloudVault', 'description': '2TB encrypted secure cloud storage subscription for backup and multi-device sync.', 'price_minor': 99900, 'policy_type': 'NON_REFUNDABLE', 'refund_percentage': 0, 'window': 0, 'defective_only': False, 'exceptions': ['duplicate_billing'], 'verification': 'NONE', 'notes': 'Digital subscriptions are non-refundable unless duplicate billing occurs'},
    {'shop_id': 'PROD-010', 'sku': 'AUD-EG-010', 'name': 'EchoGo Speaker (Clearance)', 'category': 'AUDIO', 'brand': 'EchoGo', 'description': 'Compact IPX7 waterproof portable Bluetooth speaker on clearance sale.', 'price_minor': 149900, 'policy_type': 'EXCHANGE_ONLY', 'refund_percentage': 0, 'window': 15, 'defective_only': True, 'exceptions': ['defective'], 'verification': 'NONE', 'notes': 'Clearance product is exchange only; refunds only granted if verified defective'},
    {'shop_id': 'PROD-011', 'sku': 'WRB-PW-011', 'name': 'Pulse Smart Watch S2', 'category': 'WEARABLES', 'brand': 'Pulse', 'description': 'Fitness smartwatch with continuous heart rate, SpO2 monitoring, and AMOLED display.', 'price_minor': 899900, 'policy_type': 'FULL_SHORT_WINDOW', 'refund_percentage': 100, 'window': 7, 'defective_only': False, 'exceptions': [], 'verification': 'NONE', 'notes': 'Strict 7-day return window for smart wearables'},
    {'shop_id': 'PROD-012', 'sku': 'PER-KF-012', 'name': 'KeyForge Mechanical Keyboard', 'category': 'PERIPHERALS', 'brand': 'KeyForge', 'description': '75% compact RGB mechanical gaming keyboard with hot-swappable tactile switches.', 'price_minor': 549900, 'policy_type': 'DEFECTIVE_ONLY', 'refund_percentage': 100, 'window': 30, 'defective_only': True, 'exceptions': [], 'verification': 'NONE', 'notes': 'Refund only if defective or damaged with photographic evidence'},
    {'shop_id': 'PROD-013', 'sku': 'PER-VM-013', 'name': 'Viper Gaming Mouse', 'category': 'PERIPHERALS', 'brand': 'Viper', 'description': 'Ultra-lightweight 58g ergonomic esports gaming mouse with 26K DPI optical sensor.', 'price_minor': 229900, 'policy_type': 'FULL', 'refund_percentage': 100, 'window': 30, 'defective_only': False, 'exceptions': [], 'verification': 'NONE', 'notes': 'Full refund within 30 days; evidence required for damaged or defective claims'},
    {'shop_id': 'PROD-014', 'sku': 'DSP-VM-014', 'name': 'ViewMax 27" Monitor', 'category': 'DISPLAYS', 'brand': 'ViewMax', 'description': '27-inch QHD 2560x1440 IPS 165Hz gaming and color-accurate productivity monitor.', 'price_minor': 1899900, 'policy_type': 'FULL', 'refund_percentage': 100, 'window': 10, 'defective_only': False, 'exceptions': [], 'verification': 'NONE', 'notes': '10-day return window; photo evidence required for panel defects or dead pixels'},
    {'shop_id': 'PROD-015', 'sku': 'TAB-ST-015', 'name': 'Slate Tab 11 Tablet', 'category': 'TABLETS', 'brand': 'Slate', 'description': '11-inch 2.5K high-res display flagship tablet with stylus support and quad speakers.', 'price_minor': 5499900, 'policy_type': 'FULL_HIGH_VALUE', 'refund_percentage': 100, 'window': 14, 'defective_only': False, 'exceptions': [], 'verification': 'SERIAL', 'notes': 'Flagship tablet above high-value threshold; serial verification mandatory'},
]

# RITOS tables cleared by --reset (users, return_policies and ledger_accounts are kept)
RESET_TABLES = {
    "workflow_steps", "workflow_runs", "outbox_messages", "inbound_events", "ticket_events", "ticket_comments",
    "evidence_files", "ledger_entries", "ledger_journals", "gateway_settlement_attempts", "idempotency_records",
    "refund_requests", "audit_logs", "tickets", "carrier_shipments", "order_items", "transactions",
    "product_reference_images", "product_variants", "products",
}
DEFECT_EXCEPTIONS = {"defective_on_arrival", "manufacturing_defect", "defective", "physical_damage_review"}
# Days since each demo order: inside the return window, except the laptop (shows the "return period ended" path)
ORDER_AGE_DAYS = {"PROD-001": 5, "PROD-002": 3, "PROD-003": 20, "PROD-004": 6, "PROD-005": 8, "PROD-006": 2,
                  "PROD-007": 4, "PROD-008": 3, "PROD-009": 1, "PROD-010": 5, "PROD-011": 2, "PROD-012": 6,
                  "PROD-013": 4, "PROD-014": 3, "PROD-015": 5}
CUSTOMER_EMAIL = "customer@ritos.local"


def ritos_policy(p: dict) -> dict:
    """ShopFlow's per-product rules in RITOS terms. Defective-only and non-refundable items get a 0-day window
    (final sale); a defect exception then allows item-problem claims with a photo."""
    window = 0 if p["defective_only"] or p["policy_type"] == "NON_REFUNDABLE" else p["window"]
    defects = p["defective_only"] or bool(DEFECT_EXCEPTIONS & set(p["exceptions"]))
    rule = (f"{window}-day return window" if window else "Final sale") + \
           ("; verified defects accepted" if defects else "; no defect exception")
    if 0 < p["refund_percentage"] < 100:
        rule += f"; the store refunds {p['refund_percentage']}% (the RITOS portal refunds the full item amount)"
    return {"return_window_days": window, "allow_damaged_exceptions": defects,
            "requires_serial": p["verification"] in ("IMEI", "SERIAL"),
            "policy_summary": f"{rule}. ShopFlow {p['policy_type']} policy: {p['notes'] or 'standard terms'}."}


def policy_rows() -> dict:
    """{policy key: policy}. A category follows its first product that is not defective-only; a product whose rules
    differ from its category's gets its own "SKU:<sku>" row."""
    by_cat: dict = {}
    for p in PRODUCTS:
        by_cat.setdefault(p["category"], []).append(p)
    rows = {}
    key = lambda pol: (pol["return_window_days"], pol["allow_damaged_exceptions"])
    for cat, items in by_cat.items():
        base = next((p for p in items if not p["defective_only"]), items[0])
        rows[cat] = ritos_policy(base)
        for p in items:
            if key(ritos_policy(p)) != key(rows[cat]):
                rows[f"SKU:{p['sku']}"] = ritos_policy(p)
    return rows


def reset(db) -> dict:
    from . import evidence_store
    root = evidence_store._root()
    paths = {r for (r,) in db.execute(select(EvidenceFile.storage_path)) if r}
    db.execute(update(Ticket).values(duplicate_of_id=None))
    counts = {}
    for table in reversed(Base.metadata.sorted_tables):  # children before parents
        if table.name in RESET_TABLES:
            counts[table.name] = db.execute(table.delete()).rowcount
    db.commit()
    removed = 0
    for rel in paths:  # the stored photos the deleted evidence rows pointed to
        f = root / rel
        if f.is_file():
            f.unlink(); removed += 1
    counts["evidence photos on disk"] = removed
    return counts


def load(db) -> dict:
    customer = db.scalar(select(User).where(User.email == CUSTOMER_EMAIL))
    if not customer:
        raise SystemExit(f"{CUSTOMER_EMAIL} not found: run `python -m app.seed` first.")
    now = datetime.now(timezone.utc)
    added = {"products": 0, "return policies": 0, "orders": 0}
    for p in PRODUCTS:
        if not db.get(Product, p["sku"]):
            db.add(Product(sku=p["sku"], name=p["name"], category=p["category"], brand=p["brand"], model=p["name"],
                           description=p["description"], price_minor=p["price_minor"], currency="INR"))
            added["products"] += 1
    for k, pol in policy_rows().items():
        if not db.scalar(select(ReturnPolicy).where(ReturnPolicy.category == k, ReturnPolicy.active.is_(True))):
            db.add(ReturnPolicy(category=k, **pol))
            added["return policies"] += 1
    db.flush()
    for i, p in enumerate(PRODUCTS, start=1):
        txid = f"TXN-SF-{i:02d}"
        if db.get(Transaction, txid):
            continue
        amount = p["price_minor"] / 100
        db.add(Transaction(id=txid, customer_id=customer.id, order_id=f"ORD-SF-{i:02d}", amount=amount, currency="INR",
                           payment_status="SUCCESSFUL", refunded_amount=0, provider_reference=f"DEMO-{txid}",
                           created_at=now - timedelta(days=ORDER_AGE_DAYS[p["shop_id"]])))
        db.flush()
        db.add(OrderItem(transaction_id=txid, product_sku=p["sku"], amount=amount))
        added["orders"] += 1
    db.commit()
    return added


def main() -> None:
    ap = argparse.ArgumentParser(description="Replace RITOS's demo data with the ShopFlow product catalog.")
    ap.add_argument("--reset", action="store_true", help="clear RITOS tickets, orders and products first")
    args = ap.parse_args()
    init_db()
    with SessionLocal() as db:
        if args.reset:
            for name, n in reset(db).items():
                print(f"  cleared {n:>5}  {name}")
        added = load(db)
    print("Imported:", ", ".join(f"{n} {k}" for k, n in added.items()))


if __name__ == "__main__":
    main()
