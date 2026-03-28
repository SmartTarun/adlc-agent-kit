# Agent: kiran | Sprint: 01 | Date: 2026-03-28
"""Tests for /api/v1/health endpoint."""

import pytest


@pytest.mark.asyncio
async def test_health_check_returns_200(client):
    resp = await client.get("/api/v1/health/")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_health_check_contains_status(client):
    resp = await client.get("/api/v1/health/")
    data = resp.json()
    assert "status" in data
    assert data["status"] in ("healthy", "degraded")


@pytest.mark.asyncio
async def test_health_check_db_field(client):
    resp = await client.get("/api/v1/health/")
    data = resp.json()
    assert "database" in data
    assert data["database"] == "ok"


@pytest.mark.asyncio
async def test_health_check_anthropic_field(client):
    resp = await client.get("/api/v1/health/")
    data = resp.json()
    assert "anthropic_api_key" in data
