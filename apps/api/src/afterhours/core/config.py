"""Application settings, loaded from environment variables (prefix ``AH_``)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AH_", extra="ignore")

    env: Literal["dev", "test", "prod"] = "dev"

    # Any PostgreSQL works: local, Supabase (session pooler), or RDS.
    database_url: str = "postgresql+asyncpg://localhost/afterhours_dev"
    # Supabase and RDS require TLS; local Postgres does not.
    database_ssl: bool = False
    # Supabase's transaction pooler (port 6543) does not support prepared statements.
    database_disable_statement_cache: bool = False

    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: SecretStr
    jwt_algorithm: Literal["HS256"] = "HS256"
    access_token_ttl_seconds: int = Field(default=900, ge=60, le=3600)
    refresh_token_ttl_days: int = Field(default=7, ge=1, le=30)
    # Must be True whenever the app is served over HTTPS.
    cookie_secure: bool = False

    cors_origins: list[str] = ["http://localhost:3000"]

    # Password for demo accounts created by the dev seed (never used in prod).
    seed_password: SecretStr | None = None

    # One-click demo sign-in by role (portfolio demo). Never honoured when env=prod.
    demo_login: bool = False

    # Failed sign-ons allowed per (email, client IP) within the window before 429.
    login_max_failures: int = Field(default=5, ge=1, le=100)
    login_failure_window_seconds: int = Field(default=900, ge=60, le=86_400)

    # --- Simulation (all output is fictional and labelled as simulated) ---
    sim_tick_seconds: float = Field(default=2.0, ge=0.2, le=60)
    sim_autostart: bool = True
    worker_metrics_port: int = Field(default=9101, ge=1024, le=65535)
    sim_seed: int = 7
    park_capacity: int = Field(default=45_000, ge=1000)

    # Redis keys; overridable so tests never touch dev data.
    events_stream: str = "ah:events"
    activity_list: str = "ah:activity"
    sim_state_key: str = "ah:sim"

    log_level: str = "INFO"
    log_json: bool = True

    @field_validator("database_url")
    @classmethod
    def _use_asyncpg_driver(cls, v: str) -> str:
        # Supabase and most providers hand out plain ``postgresql://`` URLs.
        for prefix in ("postgresql://", "postgres://"):
            if v.startswith(prefix):
                return "postgresql+asyncpg://" + v[len(prefix) :]
        return v

    @field_validator("jwt_secret")
    @classmethod
    def _strong_secret(cls, v: SecretStr) -> SecretStr:
        if len(v.get_secret_value()) < 32:
            raise ValueError("AH_JWT_SECRET must be at least 32 characters")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
