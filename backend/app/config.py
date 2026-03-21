# Agent: Kiran | Sprint: 01 | Date: 2026-03-16
"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings sourced from environment variables or .env file."""

    app_env: str = "development"
    app_version: str = "0.1.0"

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/infraviz"

    anthropic_api_key: str = ""

    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60

    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    model_config = {"env_file": ".env", "case_sensitive": False}

    @property
    def cors_origins_list(self) -> list[str]:
        """Return CORS origins as a list."""
        return [origin.strip() for origin in self.cors_origins.split(",")]


settings = Settings()
