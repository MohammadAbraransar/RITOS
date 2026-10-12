from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_env: str = "development"
    jwt_secret: str = "development-only-change-this-secret"
    seed_password: str = "ChangeMe123!"
    database_url: str = "sqlite:///./ritos.db"
    # Postgres schema for RITOS tables (e.g. "ritos" on a shared Supabase project). Ignored for SQLite.
    db_schema: str = ""
    cors_origins: str = "http://localhost:5173"
    access_token_minutes: int = 45
    redis_url: str = "redis://localhost:6379/0"
    ecommerce_webhook_secret: str = ""
    # 127.0.0.1 instead of localhost: on Windows, localhost tries IPv6 first and adds ~2s per call.
    shopflow_base_url: str = "http://127.0.0.1:3000"
    ritos_api_key: str = "ritos_dev_key_secret_2026"
    # Orchestrator guardrails: CS-1 claims above this amount (or with any risk signal) wait for a human.
    auto_approve_max_inr: float = 5000.0
    # Background outbox delivery (decision callbacks, status updates, notifications to the store)
    run_background_workers: bool = True
    outbox_poll_seconds: float = 2.0
    outbox_max_attempts: int = 6
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
