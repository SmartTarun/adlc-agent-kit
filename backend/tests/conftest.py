# Agent: kiran | Sprint: 01 | Date: 2026-03-28
"""Pytest configuration — async test client and in-memory SQLite database."""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.dependencies import get_db
from app.main import app
from app.models.cbre import Building, Lease, Property, Tenant

_TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(_TEST_DB_URL, echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def seed_property(db_session: AsyncSession) -> Property:
    prop = Property(
        id=uuid.uuid4(),
        name="1 Market Street",
        address="1 Market St",
        city="San Francisco",
        state="CA",
        class_type="A",
        property_type="office",
        total_sqft=50000.0,
        asset_value=25_000_000.0,
        noi=1_500_000.0,
        cap_rate=0.06,
        occupancy_rate=0.92,
    )
    db_session.add(prop)
    await db_session.flush()
    return prop


@pytest_asyncio.fixture
async def seed_building(db_session: AsyncSession, seed_property: Property) -> Building:
    building = Building(
        id=uuid.uuid4(),
        property_id=seed_property.id,
        name="Tower A",
        floors=10,
        total_sqft=50000.0,
    )
    db_session.add(building)
    await db_session.flush()
    return building


@pytest_asyncio.fixture
async def seed_tenant(db_session: AsyncSession) -> Tenant:
    tenant = Tenant(
        id=uuid.uuid4(),
        name="Acme Corp",
        industry="Technology",
        credit_rating="A",
        satisfaction_score=8.5,
    )
    db_session.add(tenant)
    await db_session.flush()
    return tenant


@pytest_asyncio.fixture
async def seed_lease(
    db_session: AsyncSession,
    seed_property: Property,
    seed_tenant: Tenant,
) -> Lease:
    lease = Lease(
        id=uuid.uuid4(),
        property_id=seed_property.id,
        tenant_id=seed_tenant.id,
        unit_number="Suite 100",
        sqft=5000.0,
        start_date=datetime.now(timezone.utc) - timedelta(days=365),
        end_date=datetime.now(timezone.utc) + timedelta(days=180),
        monthly_rent=25000.0,
        dscr=1.35,
        risk_score=42.0,
        risk_level="Medium",
        ai_recommendations="Monitor lease renewal. DSCR adequate but approaching 2yr threshold.",
        is_active=True,
    )
    db_session.add(lease)
    await db_session.flush()
    return lease
