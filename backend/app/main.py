# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""InfraViz FastAPI application entry point."""

import uuid

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal, get_db
from app.models.user import User
from app.routers import health, iac, llm, projects, state
from app.routers.auth import (
    hash_password,
    require_auth,
    router as auth_router,
)
from app.schemas.auth import UserOut

app = FastAPI(
    title="InfraViz API",
    description=(
        "AI-powered IaC generation platform. "
        "Claude claude-sonnet-4-6 generates production-ready Terraform from "
        "natural language or visual canvas topology."
    ),
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(health.router)
app.include_router(auth_router)
app.include_router(projects.router)
app.include_router(iac.router)
app.include_router(state.router)
app.include_router(llm.router)


# ---------------------------------------------------------------------------
# /auth/me — wired here with the real dependency
# ---------------------------------------------------------------------------

@app.get(
    "/auth/me",
    response_model=UserOut,
    tags=["auth"],
    summary="Get current authenticated user",
    description="Returns the user profile for the bearer token in the Authorization header.",
)
async def me(current_user: User = Depends(require_auth)) -> UserOut:
    return UserOut.model_validate(current_user)


# ---------------------------------------------------------------------------
# Startup — seed default demo user
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def seed_demo_user() -> None:
    """Create a default admin user if no users exist (Sprint-01 demo convenience)."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).limit(1))
        if result.scalar_one_or_none() is None:
            demo = User(
                id=uuid.uuid4(),
                username="admin",
                email="admin@infraviz.dev",
                hashed_password=hash_password("infraviz2026"),
                is_active=True,
            )
            session.add(demo)
            await session.commit()
