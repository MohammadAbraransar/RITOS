from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_env: str = "development"
    jwt_secret: str = "development-only-change-this-secret"
    seed_password: str = "ChangeMe123!"
    database_url: str = "sqlite:///./ritos.db"
    cors_origins: str = "http://localhost:5173"
    access_token_minutes: int = 45
    redis_url: str = "redis://localhost:6379/0"
    ecommerce_webhook_secret: str = ""
    shopflow_base_url: str = "http://localhost:3001"
    ritos_api_key: str = "ritos_dev_key_secret_2026"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
