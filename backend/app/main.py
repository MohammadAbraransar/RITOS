import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from sqlalchemy import text
from .database import engine, init_db
from .api import router, shopflow_webhook
from .outbox import start_worker, stop_worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# Fail closed when a production deployment accidentally retains the development JWT secret.
if settings.app_env.lower() == "production":
    if settings.jwt_secret == "development-only-change-this-secret" or len(settings.jwt_secret) < 32:
        raise RuntimeError("JWT_SECRET must be a unique secret of at least 32 characters in production")
    if settings.database_url.startswith("sqlite"):
        raise RuntimeError("A persistent PostgreSQL DATABASE_URL is required in production")
    if "*" in [origin.strip() for origin in settings.cors_origins.split(",")]:
        raise RuntimeError("Wildcard CORS origins are not allowed in production")
    if settings.ritos_api_key == "ritos_dev_key_secret_2026":
        raise RuntimeError("RITOS_API_KEY must be changed from the development default in production")

init_db()

if settings.app_env.lower() == "development":
    try:
        from .database import SessionLocal
        from .models import User
        from .seed import main as seed_db
        with SessionLocal() as _db:
            if not _db.query(User).first():
                seed_db()
    except Exception as exc:
        logging.getLogger("ritos").warning("Development seed skipped: %s", exc)

@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.run_background_workers:
        start_worker()
    yield
    stop_worker()

app=FastAPI(title="RITOS API",version="1.1.0",description="Refund intelligence and ticket orchestration API",lifespan=lifespan)
origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()]
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_credentials=True,allow_methods=["*"],allow_headers=["*"])
app.include_router(router)

# Root webhook paths for direct ShopFlow outbox compatibility
app.add_api_route("/webhook/refund-tickets", shopflow_webhook, methods=["POST"])
app.add_api_route("/webhooks/shopflow", shopflow_webhook, methods=["POST"])

@app.get("/")
def root():
    return {"name":"RITOS","version":"1.1.0","docs":"/docs","mode":settings.app_env}

@app.get("/health")
def health():
    # Verify the database connection instead of reporting a false healthy status.
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail={"status":"degraded", "database":"unavailable"})
    return {"status":"ok","database":"reachable","provider":"mock","financial_execution":"disabled_for_real_payments"}
