import re
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings

# Render, Supabase and several hosted PostgreSQL providers expose postgres:// or postgresql:// URLs.
# Normalize them to the explicitly installed psycopg 3 driver.
database_url = settings.database_url
if database_url.startswith("postgres://"):
    database_url = "postgresql+psycopg://" + database_url[len("postgres://"): ]
elif database_url.startswith("postgresql://"):
    database_url = "postgresql+psycopg://" + database_url[len("postgresql://"): ]

is_sqlite = database_url.startswith("sqlite")
# prepare_threshold=None keeps psycopg compatible with PgBouncer/Supavisor transaction pooling.
connect_args = {"check_same_thread": False} if is_sqlite else {"prepare_threshold": None}
engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)

db_schema = "" if is_sqlite else settings.db_schema.strip()
if db_schema:
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", db_schema):
        raise RuntimeError("DB_SCHEMA must be a lowercase identifier such as 'ritos'")
    # Every unqualified table is placed in the configured schema, for both DDL and queries.
    engine = engine.execution_options(schema_translate_map={None: db_schema})

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def init_db():
    """Create the schema (if configured) and any missing tables."""
    from . import models  # noqa: F401  (register models on Base.metadata)
    if db_schema:
        with engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{db_schema}"'))
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
