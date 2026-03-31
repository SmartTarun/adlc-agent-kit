# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""Tests for /projects endpoints — workspace CRUD + canvas state."""

import pytest
from httpx import AsyncClient

from app.models.project import Project
from app.models.user import User


@pytest.mark.asyncio
async def test_create_project(client: AsyncClient, auth_headers: dict) -> None:
    resp = await client.post(
        "/projects",
        json={
            "name": "my-vpc",
            "description": "A test VPC project",
            "cloud_provider": "aws",
            "region": "us-east-1",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "my-vpc"
    assert data["cloud_provider"] == "aws"
    assert data["region"] == "us-east-1"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_projects(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    resp = await client.get("/projects", headers=auth_headers)
    assert resp.status_code == 200
    projects = resp.json()
    assert isinstance(projects, list)
    ids = [p["id"] for p in projects]
    assert str(test_project.id) in ids


@pytest.mark.asyncio
async def test_get_project(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    resp = await client.get(f"/projects/{test_project.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == str(test_project.id)


@pytest.mark.asyncio
async def test_get_project_not_found(client: AsyncClient, auth_headers: dict) -> None:
    import uuid

    resp = await client.get(f"/projects/{uuid.uuid4()}", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_project(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    resp = await client.put(
        f"/projects/{test_project.id}",
        json={"name": "renamed-project", "region": "eu-west-1"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "renamed-project"
    assert data["region"] == "eu-west-1"


@pytest.mark.asyncio
async def test_delete_project(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    resp = await client.delete(f"/projects/{test_project.id}", headers=auth_headers)
    assert resp.status_code == 204

    # Should no longer be retrievable
    resp2 = await client.get(f"/projects/{test_project.id}", headers=auth_headers)
    assert resp2.status_code == 404


@pytest.mark.asyncio
async def test_create_project_unauthenticated(client: AsyncClient) -> None:
    resp = await client.post(
        "/projects",
        json={"name": "no-auth"},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Canvas state
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_save_and_load_canvas(
    client: AsyncClient, auth_headers: dict
) -> None:
    # Create a project first
    proj_resp = await client.post(
        "/projects",
        json={"name": "canvas-test-project"},
        headers=auth_headers,
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]

    nodes = [{"id": "1", "type": "ec2", "label": "web", "config": {}}]
    edges = [{"source": "1", "target": "2"}]

    save_resp = await client.put(
        f"/projects/{project_id}/canvas",
        json={"nodes": nodes, "edges": edges},
        headers=auth_headers,
    )
    assert save_resp.status_code == 200
    saved = save_resp.json()
    assert saved["nodes"] == nodes
    assert saved["edges"] == edges

    load_resp = await client.get(
        f"/projects/{project_id}/canvas", headers=auth_headers
    )
    assert load_resp.status_code == 200
    loaded = load_resp.json()
    assert loaded["nodes"] == nodes
    assert loaded["edges"] == edges


@pytest.mark.asyncio
async def test_load_canvas_empty(
    client: AsyncClient, auth_headers: dict
) -> None:
    proj_resp = await client.post(
        "/projects",
        json={"name": "empty-canvas-project"},
        headers=auth_headers,
    )
    project_id = proj_resp.json()["id"]

    resp = await client.get(f"/projects/{project_id}/canvas", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["nodes"] == []
    assert data["edges"] == []
