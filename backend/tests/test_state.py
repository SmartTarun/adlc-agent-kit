# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""Tests for /state endpoints — Terraform state import and listing."""

import json
import uuid

import pytest
from httpx import AsyncClient

from app.models.project import Project
from app.models.user import User

_VALID_TFSTATE = json.dumps({
    "version": 4,
    "terraform_version": "1.7.0",
    "resources": [
        {"type": "aws_instance", "name": "web", "instances": []},
        {"type": "aws_s3_bucket", "name": "assets", "instances": []},
    ],
})


@pytest.mark.asyncio
async def test_import_state(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    resp = await client.post(
        "/state/import",
        json={
            "project_id": str(test_project.id),
            "state_content": _VALID_TFSTATE,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["project_id"] == str(test_project.id)
    assert data["resource_count"] == 2
    assert data["checksum"] is not None
    assert data["state_version"] == 1
    assert data["status"] == "active"


@pytest.mark.asyncio
async def test_import_state_increments_version(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    for _ in range(3):
        await client.post(
            "/state/import",
            json={"project_id": str(test_project.id), "state_content": _VALID_TFSTATE},
            headers=auth_headers,
        )

    resp = await client.get(f"/state/{test_project.id}", headers=auth_headers)
    assert resp.status_code == 200
    versions = [s["state_version"] for s in resp.json()]
    assert len(versions) >= 3
    assert max(versions) >= 3


@pytest.mark.asyncio
async def test_import_invalid_json(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    resp = await client.post(
        "/state/import",
        json={
            "project_id": str(test_project.id),
            "state_content": "not-json-at-all",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_import_state_project_not_found(
    client: AsyncClient, auth_headers: dict
) -> None:
    resp = await client.post(
        "/state/import",
        json={"project_id": str(uuid.uuid4()), "state_content": _VALID_TFSTATE},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_state_files(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    await client.post(
        "/state/import",
        json={"project_id": str(test_project.id), "state_content": _VALID_TFSTATE},
        headers=auth_headers,
    )

    resp = await client.get(f"/state/{test_project.id}", headers=auth_headers)
    assert resp.status_code == 200
    files = resp.json()
    assert isinstance(files, list)
    assert len(files) >= 1
    assert files[0]["project_id"] == str(test_project.id)


@pytest.mark.asyncio
async def test_state_unauthenticated(
    client: AsyncClient, test_project: Project
) -> None:
    resp = await client.get(f"/state/{test_project.id}")
    assert resp.status_code == 403
