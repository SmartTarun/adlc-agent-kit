# Agent: kiran | Sprint: 01 | Date: 2026-03-28
"""Tests for /api/v1/portfolio endpoints."""

import pytest


@pytest.mark.asyncio
async def test_overview_empty_db(client):
    resp = await client.get("/api/v1/portfolio/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_properties"] == 0


@pytest.mark.asyncio
async def test_overview_with_property(client, seed_property):
    resp = await client.get("/api/v1/portfolio/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_properties"] >= 1
    assert data["total_noi"] > 0
    assert data["total_asset_value"] > 0


@pytest.mark.asyncio
async def test_list_properties_returns_200(client, seed_property):
    resp = await client.get("/api/v1/portfolio/properties")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_list_properties_filter_by_class(client, seed_property):
    resp = await client.get("/api/v1/portfolio/properties", params={"class_type": "A"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all(p["class_type"] == "A" for p in items)


@pytest.mark.asyncio
async def test_list_properties_filter_by_city(client, seed_property):
    resp = await client.get("/api/v1/portfolio/properties", params={"city": "San Francisco"})
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_get_property_by_id(client, seed_property):
    resp = await client.get(f"/api/v1/portfolio/properties/{seed_property.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "1 Market Street"


@pytest.mark.asyncio
async def test_get_property_not_found(client):
    import uuid
    resp = await client.get(f"/api/v1/portfolio/properties/{uuid.uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_portfolio_pagination(client, seed_property):
    resp = await client.get("/api/v1/portfolio/properties", params={"page": 1, "page_size": 5})
    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 1
    assert data["page_size"] == 5
