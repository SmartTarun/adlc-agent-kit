# Agent: kiran | Sprint: 01 | Date: 2026-03-28
"""Tests for /api/v1/esg endpoints."""

import uuid
from datetime import datetime, timezone

import pytest


@pytest.mark.asyncio
async def test_carbon_chart_returns_200(client):
    resp = await client.get("/api/v1/esg/carbon")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_carbon_chart_structure(client):
    resp = await client.get("/api/v1/esg/carbon")
    data = resp.json()
    assert "buildings" in data
    assert "reporting_year" in data
    assert data["reporting_year"] == datetime.now(timezone.utc).year


@pytest.mark.asyncio
async def test_carbon_chart_custom_year(client):
    resp = await client.get("/api/v1/esg/carbon", params={"year": 2025})
    assert resp.status_code == 200
    assert resp.json()["reporting_year"] == 2025


@pytest.mark.asyncio
async def test_esg_kpis_returns_200(client):
    resp = await client.get("/api/v1/esg/kpis")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_esg_kpis_structure(client):
    data = (await client.get("/api/v1/esg/kpis")).json()
    assert "buildings" in data
    assert "total_co2_tons_ytd" in data


@pytest.mark.asyncio
async def test_esg_buildings_returns_200(client):
    resp = await client.get("/api/v1/esg/buildings")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_esg_buildings_with_seed(client, seed_building):
    resp = await client.get("/api/v1/esg/buildings")
    buildings = resp.json()
    assert any(b["name"] == "Tower A" for b in buildings)
