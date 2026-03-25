# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""Health check router."""

from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: str
    environment: str


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Returns API liveness status, version, and current UTC timestamp.",
)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        version=settings.app_version,
        timestamp=datetime.now(tz=timezone.utc).isoformat(),
        environment=settings.app_env,
    )
