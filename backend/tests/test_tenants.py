# Agent: kiran | Sprint: 01 | Date: 2026-03-28
"""Tests for /api/v1/tenants (Tenant Experience Hub) endpoints."""

import pytest


@pytest.mark.asyncio
async def test_utilization_returns_200(client):
    resp = await client.get("/api/v1/tenants/utilization")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_satisfaction_returns_200(client):
    resp = await client.get("/api/v1/tenants/satisfaction")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_maintenance_returns_200(client):
    resp = await client.get("/api/v1/tenants/maintenance")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_maintenance_structure(client):
    data = (await client.get("/api/v1/tenants/maintenance")).json()
    assert "items" in data
    assert "total" in data
    assert "open_count" in data
    assert "in_progress_count" in data


@pytest.mark.asyncio
async def test_maintenance_filter_by_status(client):
    resp = await client.get("/api/v1/tenants/maintenance", params={"status": "open"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all(i["status"] == "open" for i in items)
