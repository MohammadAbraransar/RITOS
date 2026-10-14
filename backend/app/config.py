from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_env: str = "development"
    jwt_secret: str = "development-only-change-this-secret"
    seed_password: str = "ChangeMe123!"
    database_url: str = "sqlite:///./ritos.db"
    # Postgres schema for RITOS tables (e.g. "ritos" on a shared Supabase project). Ignored for SQLite.
    db_schema: str = ""
    # Connection pool (PostgreSQL only). A Supabase session-mode pooler (port 5432) caps clients per database,
    # so keep db_pool_size + db_max_overflow below that cap; transaction mode (port 6543) is far less constrained.
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_timeout_seconds: int = 30
    db_pool_recycle_seconds: int = 1800
    # Liveness ping on every checkout: safer against dropped connections, but costs one network round-trip.
    db_pool_pre_ping: bool = True
    # Comma-separated ISO codes accepted on refund claims
    supported_currencies: str = "INR,USD,EUR,GBP"
    # Currency assumed when a store or form omits one
    default_currency: str = "INR"
    # Storefront demo claims that do not exist in the store DB (RITOS invents their order/transaction). Never in production.
    demo_claims_enabled: bool = False
    # Desk portal origins allowed to call the API (localhost and 127.0.0.1 are different origins to a browser)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    access_token_minutes: int = 45
    redis_url: str = "redis://localhost:6379/0"
    ecommerce_webhook_secret: str = ""
    # 127.0.0.1 instead of localhost: on Windows, localhost tries IPv6 first and adds ~2s per call.
    shopflow_base_url: str = "http://127.0.0.1:3000"
    # Store calls: claim context / sync (can be slow over WAN) and the quick health probe
    store_request_timeout_seconds: float = 20.0
    store_health_timeout_seconds: float = 2.0
    ritos_api_key: str = "ritos_dev_key_secret_2026"
    # Orchestrator guardrails: CS-1 claims above this amount (or with any risk signal) wait for a human.
    auto_approve_max_inr: float = 5000.0
    # Payout authorization (four-eyes: proposer != approver != executor). Comma-separated role names.
    payout_proposer_roles: str = "cs_1,finance_approver,refund_operations,administrator"
    # Claims RITOS routed for approval (above the automatic limit or risk-flagged) need one of these roles
    payout_supervisory_roles: str = "supervisor,finance_approver,administrator"
    payout_approver_roles: str = "finance_approver,administrator"
    payout_executor_roles: str = "finance_approver,refund_operations,administrator"
    payout_reconciler_roles: str = "finance_approver,administrator,auditor"
    # Background outbox delivery (decision callbacks, status updates, notifications to the store)
    run_background_workers: bool = True
    outbox_poll_seconds: float = 8.0
    outbox_max_attempts: int = 6
    outbox_batch_size: int = 20
    outbox_http_timeout_seconds: float = 10.0
    outbox_base_backoff_seconds: int = 2
    outbox_max_backoff_seconds: int = 300
    # A claimed message is hidden from other workers for this long; if delivery crashes it becomes due again.
    outbox_claim_lease_seconds: int = 60
    # --- Risk rules (Agent 4); score weights are versioned in risk_agent.RULE_VERSION ---
    risk_high_velocity_claims_30d: int = 3
    risk_new_account_days: int = 7
    # Refunded share of lifetime spend that raises a review signal, once the customer has this many orders
    risk_refund_ratio_threshold: float = 0.5
    risk_refund_ratio_min_orders: int = 3
    risk_tier_high_score: int = 60
    risk_tier_medium_score: int = 30
    # --- LLM assist layer (advises only; rules decide). Providers: none | groq | gemini ---
    llm_provider: str = "none"
    llm_fallback_provider: str = "none"
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "qwen/qwen3.8-27b"
    gemini_api_key: str = ""
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    gemini_model: str = "gemini-flash-lite-latest"
    llm_timeout_seconds: float = 8.0
    llm_max_output_tokens: int = 400
    llm_temperature: float = 0.0
    # Remove names, emails, phone and card numbers before any text is sent to a provider
    llm_redact_pii: bool = True
    # Customer messages longer than this are rejected and the template is used instead
    llm_message_max_chars: int = 900
    # --- Visual evidence ---
    # Semantic vision provider for product identity and defect assessment: "none" or "clip" (local, free).
    # With "none", photo claims are never auto-verified: they are reported inconclusive and go to CS-2.
    vision_provider: str = "none"
    vision_model_name: str = "ViT-B-32"
    # OpenCLIP weights tag for the model (see open_clip.list_pretrained())
    vision_model_pretrained: str = "laion2b_s34b_b79k"
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
    # --- Reviewer assignment: roles that receive work in each queue (least-loaded person is assigned) ---
    review_queue_cs2_roles: str = "cs_2"
    review_queue_cs3_roles: str = "cs_3"
    review_queue_supervisor_roles: str = "supervisor"
    # --- Settlement ---
    # Business days quoted to customers for bank settlement; leave empty to quote no timeline
    refund_settlement_days: int | None = None
    # Secret for HMAC-SHA256 verification of payment-gateway webhooks (empty = webhooks rejected)
    gateway_webhook_secret: str = ""
    stripe_api_key: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def currencies(self) -> set[str]:
        return {c.strip().upper() for c in self.supported_currencies.split(",") if c.strip()}

settings = Settings()
