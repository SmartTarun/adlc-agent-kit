# Agent: kiran | Sprint: 01 | Date: 2026-03-28
"""Tests for /api/v1/leases endpoints."""

import pytest


@pytest.mark.asyncio
async def test_lease_risk_returns_200(client):
    resp = await client.get("/api/v1/leases/risk")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_lease_risk_structure(client, seed_lease):
    resp = await client.get("/api/v1/leases/risk")
    data = resp.json()
    assert "items" in data
    assert "high_risk_count" in data
    assert "medium_risk_count" in data
    assert "low_risk_count" in data


@pytest.mark.asyncio
async def test_lease_risk_with_seeded_data(client, seed_lease):
    resp = await client.get("/api/v1/leases/risk")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    row = next(r for r in data["items"] if r["risk_level"] == "Medium")
    assert row["tenant_name"] == "Acme Corp"
    assert row["days_to_expiry"] >= 0


@pytest.mark.asyncio
async def test_lease_risk_filter_by_level(client, seed_lease):
    resp = await client.get("/api/v1/leases/risk", params={"risk_level": "Medium"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all(r["risk_level"] == "Medium" for r in items)


@pytest.mark.asyncio
async def test_list_tenants(client, seed_tenant):
    resp = await client.get("/api/v1/leases/tenants")
    assert resp.status_code == 200
    tenants = resp.json()
    assert any(t["name"] == "Acme Corp" for t in tenants)


@pytest.mark.asyncio
async def test_tenant_detail(client, seed_tenant, seed_lease):
    resp = await client.get(f"/api/v1/leases/tenants/{seed_tenant.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["tenant"]["name"] == "Acme Corp"
    assert len(data["leases"]) >= 1


@pytest.mark.asyncio
async def test_tenant_not_found(client):
    import uuid
    resp = await client.get(f"/api/v1/leases/tenants/{uuid.uuid4()}")
    assert resp.status_code == 404
