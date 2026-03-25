# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""Shared pytest fixtures for InfraViz backend tests.

Uses an in-memory SQLite database via aiosqlite so tests run without PostgreSQL.
All tables are created from the ORM models (not Alembic), keeping tests isolated.
"""

import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app
from app.models import IacTemplate, Project, StateFile, User  # noqa: F401 — ensure models registered
from app.routers.auth import hash_password

_TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(_TEST_DB_URL, echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client with overridden DB dependency."""

    async def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    """A persisted test user."""
    user = User(
        id=uuid.uuid4(),
        username="testuser",
        email="test@infraviz.dev",
        hashed_password=hash_password("testpass123"),
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient, test_user: User) -> dict:
    """JWT bearer headers for the test user."""
    resp = await client.post(
        "/auth/login",
        json={"username": "testuser", "password": "testpass123"},
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def test_project(
    db_session: AsyncSession, test_user: User
) -> Project:
    """A persisted test project."""
    project = Project(
        id=uuid.uuid4(),
        name="test-project",
        description="Test project for unit tests",
        cloud_provider="aws",
        region="us-east-1",
        owner_id=test_user.id,
        is_active=True,
    )
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    return project
