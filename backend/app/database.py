from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings

# Render and several hosted PostgreSQL providers expose postgres:// or postgresql:// URLs.
# Normalize them to the explicitly installed psycopg 3 driver.
database_url = settings.database_url
if database_url.startswith("postgres://"):
    database_url = "postgresql+psycopg://" + database_url[len("postgres://"): ]
elif database_url.startswith("postgresql://"):
    database_url = "postgresql+psycopg://" + database_url[len("postgresql://"): ]

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
