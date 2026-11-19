"""0003_order_items: products bought in each ledger transaction

Revision ID: 0003_order_items
Revises: a53b14ae1135
"""
from alembic import op

from app.models import OrderItem

revision = "0003_order_items"
down_revision = "a53b14ae1135"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # checkfirst: the API's startup (init_db) may already have created it
    OrderItem.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    OrderItem.__table__.drop(bind=op.get_bind(), checkfirst=True)
