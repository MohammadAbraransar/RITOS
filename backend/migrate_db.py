import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "backend", "ritos.db")
if not os.path.exists(db_path):
    db_path = os.path.join(os.path.dirname(__file__), "ritos.db")

con = sqlite3.connect(db_path)
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets'")
if not cur.fetchone():
    print("Table 'tickets' does not exist yet; skipping migration as schema will be initialized by seeder.")
    con.close()
    exit(0)

existing = [r[1] for r in cur.execute("PRAGMA table_info(tickets)").fetchall()]

cols = [
    ("decision_bucket", "TEXT DEFAULT 'EXCEPTIONAL_PROOF_NEEDED'"),
    ("assigned_desk", "TEXT DEFAULT 'CS_2'"),
    ("customer_name", "TEXT"),
    ("customer_phone", "TEXT"),
    ("customer_email", "TEXT"),
    ("item_name", "TEXT"),
    ("item_category", "TEXT DEFAULT 'GENERAL'"),
    ("purchase_date", "TIMESTAMP"),
    ("customer_message_draft", "TEXT"),
    ("policy_evaluation_reason", "TEXT"),
    ("proof_required", "TEXT"),
    ("proof_status", "TEXT DEFAULT 'NOT_REQUESTED'"),
    ("proof_request_sent_at", "TIMESTAMP"),
    ("rejection_notice_sent_at", "TIMESTAMP"),
    ("refund_decided_at", "TIMESTAMP"),
    ("refund_decided_by_id", "TEXT"),
]

for col_name, col_type in cols:
    if col_name not in existing:
        cur.execute(f"ALTER TABLE tickets ADD COLUMN {col_name} {col_type}")
        print(f"Added column {col_name}")

con.commit()
con.close()
print("Migration completed successfully.")
