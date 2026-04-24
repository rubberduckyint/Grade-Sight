"""Typed settings loaded from environment variables."""

from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the Grade-Sight API."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    api_port: int = 8000
    cors_origin: str = "http://localhost:3000"
    log_level: str = "info"
    environment: str = "development"

    database_url: PostgresDsn
    test_database_url: PostgresDsn | None = None

    clerk_secret_key: str
    clerk_publishable_key: str

    stripe_secret_key: str
    stripe_webhook_secret: str
    stripe_price_parent_monthly: str
    stripe_price_teacher_monthly: str


settings = Settings()  # type: ignore[call-arg]
