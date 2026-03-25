# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""Tests for GET /health."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_returns_ok(client: AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "timestamp" in data
    assert "environment" in data


@pytest.mark.asyncio
async def test_health_timestamp_is_iso(client: AsyncClient) -> None:
    resp = await client.get("/health")
    from datetime import datetime

    ts = resp.json()["timestamp"]
    dt = datetime.fromisoformat(ts)
    assert dt.year >= 2026
