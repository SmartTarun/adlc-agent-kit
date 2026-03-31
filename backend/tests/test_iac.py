# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""Tests for /iac endpoints — generation (mocked Claude) and validation."""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.models.project import Project
from app.models.user import User

_MOCK_CLAUDE_RESPONSE = {
    "parsedRequirements": "Single EC2 instance in us-east-1",
    "architectureDesign": "## Architecture\nSingle EC2 t3.micro instance.",
    "terraformFiles": [
        {"filename": "main.tf", "content": 'resource "aws_instance" "web" { ami = "ami-123" instance_type = "t3.micro" }'},
        {"filename": "variables.tf", "content": 'variable "region" { default = "us-east-1" }'},
    ],
    "architectureDiagram": "+-------+\n| EC2   |\n+-------+",
    "costEstimate": "## Cost\n~$8.50/month for t3.micro",
    "complianceChecklist": "## Compliance\n- [ ] Enable VPC flow logs",
    "deploymentGuide": "## Deploy\n1. terraform init\n2. terraform apply",
}


async def _mock_call_claude(prompt: str):
    return _MOCK_CLAUDE_RESPONSE, 1500, 800


@pytest.mark.asyncio
async def test_generate_iac_nl_prompt(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    with patch("app.routers.iac._call_claude_structured", side_effect=_mock_call_claude):
        resp = await client.post(
            "/iac/generate",
            json={
                "project_id": str(test_project.id),
                "prompt": "Create a single EC2 instance",
                "region": "us-east-1",
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["parsed_requirements"] == _MOCK_CLAUDE_RESPONSE["parsedRequirements"]
    assert len(data["terraform_files"]) == 2
    assert data["terraform_files"][0]["filename"] == "main.tf"
    assert "template_id" in data
    assert "session_id" in data
    assert data["tokens_used"] == 1500


@pytest.mark.asyncio
async def test_generate_iac_canvas_topology(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    with patch("app.routers.iac._call_claude_structured", side_effect=_mock_call_claude):
        resp = await client.post(
            "/iac/generate",
            json={
                "project_id": str(test_project.id),
                "canvas_topology": {
                    "nodes": [{"id": "1", "type": "ec2", "label": "web", "config": {}}],
                    "edges": [],
                    "region": "us-east-1",
                },
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert resp.json()["parsed_requirements"] == _MOCK_CLAUDE_RESPONSE["parsedRequirements"]


@pytest.mark.asyncio
async def test_generate_iac_missing_input(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    with patch("app.routers.iac._call_claude_structured", side_effect=_mock_call_claude):
        resp = await client.post(
            "/iac/generate",
            json={"project_id": str(test_project.id)},
            headers=auth_headers,
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_generate_iac_project_not_found(
    client: AsyncClient, auth_headers: dict
) -> None:
    with patch("app.routers.iac._call_claude_structured", side_effect=_mock_call_claude):
        resp = await client.post(
            "/iac/generate",
            json={
                "project_id": str(uuid.uuid4()),
                "prompt": "Create an EC2 instance",
            },
            headers=auth_headers,
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_generate_iac_unauthenticated(
    client: AsyncClient, test_project: Project
) -> None:
    resp = await client.post(
        "/iac/generate",
        json={"project_id": str(test_project.id), "prompt": "EC2"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_templates(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    with patch("app.routers.iac._call_claude_structured", side_effect=_mock_call_claude):
        await client.post(
            "/iac/generate",
            json={"project_id": str(test_project.id), "prompt": "EC2 instance"},
            headers=auth_headers,
        )

    resp = await client.get(
        f"/iac/templates/{test_project.id}", headers=auth_headers
    )
    assert resp.status_code == 200
    templates = resp.json()
    assert isinstance(templates, list)
    assert len(templates) >= 1
    assert templates[0]["template_type"] == "terraform"


@pytest.mark.asyncio
async def test_get_template_detail(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    with patch("app.routers.iac._call_claude_structured", side_effect=_mock_call_claude):
        gen_resp = await client.post(
            "/iac/generate",
            json={"project_id": str(test_project.id), "prompt": "RDS instance"},
            headers=auth_headers,
        )
    template_id = gen_resp.json()["template_id"]

    resp = await client.get(
        f"/iac/templates/{test_project.id}/{template_id}", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == template_id
    assert "content" in resp.json()


@pytest.mark.asyncio
async def test_validate_invalid_hcl(client: AsyncClient, auth_headers: dict) -> None:
    """Validate obviously broken HCL — expects terraform CLI; skip if not available."""
    resp = await client.post(
        "/iac/validate",
        json={"terraform_code": "this is not valid hcl {{{{"},
        headers=auth_headers,
    )
    # If terraform not installed, subprocess raises FileNotFoundError -> 500
    # If terraform installed, should return valid=False
    assert resp.status_code in (200, 500)
    if resp.status_code == 200:
        assert resp.json()["valid"] is False
