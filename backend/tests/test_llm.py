# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""Tests for /llm endpoints — streaming and refinement."""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.models.project import Project

_MOCK_REFINE_DATA = {
    "parsedRequirements": "EC2 + CloudFront",
    "architectureDesign": "## Refined Architecture",
    "terraformFiles": [{"filename": "main.tf", "content": "# cloudfront added"}],
    "architectureDiagram": "+-------+   +------------+\n| EC2   |-->| CloudFront |\n+-------+   +------------+",
    "costEstimate": "~$15/month",
    "complianceChecklist": "- [ ] Enable WAF",
    "deploymentGuide": "terraform apply",
}


async def _mock_refine_claude(prompt: str):
    return _MOCK_REFINE_DATA, 2000, 1000


@pytest.mark.asyncio
async def test_stream_requires_auth(
    client: AsyncClient, test_project: Project
) -> None:
    resp = await client.post(
        "/llm/stream",
        json={"project_id": str(test_project.id), "prompt": "Hello"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_stream_project_not_found(
    client: AsyncClient, auth_headers: dict
) -> None:
    resp = await client.post(
        "/llm/stream",
        json={"project_id": str(uuid.uuid4()), "prompt": "Hello"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_refine_requires_auth(
    client: AsyncClient, test_project: Project
) -> None:
    resp = await client.post(
        "/llm/refine",
        json={
            "project_id": str(test_project.id),
            "template_id": str(uuid.uuid4()),
            "instruction": "Add CloudFront",
        },
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_refine_template_not_found(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    with patch("app.routers.llm._call_claude_structured", side_effect=_mock_refine_claude):
        resp = await client.post(
            "/llm/refine",
            json={
                "project_id": str(test_project.id),
                "template_id": str(uuid.uuid4()),
                "instruction": "Add CloudFront",
            },
            headers=auth_headers,
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_refine_success(
    client: AsyncClient, auth_headers: dict, test_project: Project
) -> None:
    from unittest.mock import patch as _patch

    _MOCK_GENERATE = {
        "parsedRequirements": "EC2 instance",
        "architectureDesign": "EC2 only",
        "terraformFiles": [{"filename": "main.tf", "content": "# ec2"}],
        "architectureDiagram": "+----+\n|EC2 |\n+----+",
        "costEstimate": "$8/month",
        "complianceChecklist": "- [ ] VPC logs",
        "deploymentGuide": "terraform apply",
    }

    async def _gen(prompt):
        return _MOCK_GENERATE, 1000, 500

    # First generate a template
    with _patch("app.routers.iac._call_claude_structured", side_effect=_gen):
        gen_resp = await client.post(
            "/iac/generate",
            json={"project_id": str(test_project.id), "prompt": "EC2 instance"},
            headers=auth_headers,
        )
    assert gen_resp.status_code == 200
    template_id = gen_resp.json()["template_id"]

    # Now refine
    with _patch("app.routers.llm._call_claude_structured", side_effect=_mock_refine_claude):
        resp = await client.post(
            "/llm/refine",
            json={
                "project_id": str(test_project.id),
                "template_id": template_id,
                "instruction": "Add CloudFront",
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["parsed_requirements"] == _MOCK_REFINE_DATA["parsedRequirements"]
    assert data["template_id"] != template_id  # new template created
