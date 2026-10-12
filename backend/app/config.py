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
    # --- Visual evidence ---
    # Semantic vision provider for product identity and defect assessment: "none" or "clip" (local, free).
    # With "none", photo claims are never auto-verified: they are reported inconclusive and go to CS-2.
    vision_provider: str = "none"
    vision_model_name: str = "ViT-B-32"
    vision_max_pixels: int = 25_000_000        # decompression-bomb ceiling
    vision_max_bytes: int = 10 * 1024 * 1024   # largest accepted upload
    # Image-quality gates: below these an image is "not_assessable" (tune per merchant)
    vision_min_side_px: int = 200
    vision_min_blur_variance: float = 60.0     # Laplacian variance; lower = blurrier
    vision_min_brightness: float = 30.0
    vision_max_brightness: float = 230.0
    vision_min_contrast: float = 6.0           # grey-level std-dev; lower = blank/uniform
    # Raw-score thresholds for the semantic provider. Uncalibrated until validated on labeled data.
    vision_identity_match_threshold: float = 0.80
    vision_identity_mismatch_threshold: float = 0.60
    vision_defect_margin: float = 0.05
    # Near-duplicate photo detection (difference hash, Hamming distance out of 64 bits)
    vision_duplicate_max_distance: int = 6
    # Private evidence storage (customer photos). Never served publicly and never committed to git.
    evidence_dir: str = "./evidence_store"
    # Where RITOS can download store evidence bytes (ShopFlow evidence download endpoint)
    evidence_fetch_timeout_seconds: float = 15.0
    # --- Human review SLAs (hours from routing to reviewer decision) ---
    review_sla_hours_p1: int = 4
    review_sla_hours_p2: int = 12
    review_sla_hours_default: int = 24
    # --- Settlement ---
    # Business days quoted to customers for bank settlement; leave empty to quote no timeline
    refund_settlement_days: int | None = None
    # Secret for HMAC-SHA256 verification of payment-gateway webhooks (empty = webhooks rejected)
    gateway_webhook_secret: str = ""
    stripe_api_key: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
