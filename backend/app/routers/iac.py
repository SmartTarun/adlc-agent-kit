# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""IaC generation and validation router — Claude claude-sonnet-4-6 7-step pipeline."""

import json
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.iac_template import IacTemplate
from app.models.llm_conversation import LlmConversation
from app.models.project import Project
from app.models.user import User
from app.routers.auth import require_auth
from app.schemas.iac import (
    IacGenerateRequest,
    IacGenerateResponse,
    IacTemplateDetail,
    IacTemplateOut,
    IacValidateRequest,
    IacValidateResponse,
    TerraformFile,
)

router = APIRouter(prefix="/iac", tags=["iac"])

# ---------------------------------------------------------------------------
# Claude system prompt — InfraViz 7-step pipeline
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """You are InfraViz, an expert Cloud Architect and DevOps Engineer specialising in AWS infrastructure and Terraform.

Generate high-quality, production-ready Terraform (HCL) code following this exact 7-step process:

1. PARSE REQUIREMENTS — Extract and list all infrastructure components requested.
2. DESIGN ARCHITECTURE — Describe the architecture with networking, security, and HA considerations.
3. GENERATE TERRAFORM — Produce multi-file Terraform HCL (main.tf, variables.tf, outputs.tf, and service-specific files).
4. CREATE ASCII DIAGRAM — Draw a clear ASCII topology diagram showing components and connections.
5. ESTIMATE COSTS — Provide a rough monthly cost estimate in USD for us-east-1.
6. COMPLIANCE CHECKLIST — List relevant AWS Well-Architected / CIS benchmark checks.
7. DEPLOYMENT GUIDE — Provide step-by-step instructions for initialising and applying the Terraform.

RULES:
- AWS-only. Terraform-only. No apply/destroy — generate and validate only.
- Use variables for all configurable values. Never hardcode account IDs or secrets.
- Always output valid JSON matching the response schema exactly.
- Use provider version ~> 5.0 and Terraform >= 1.7.
"""

_RESPONSE_SCHEMA_PROMPT = """
Respond with ONLY a valid JSON object matching this exact schema (no markdown fences, no commentary):
{
  "parsedRequirements": "<string>",
  "architectureDesign": "<markdown string>",
  "terraformFiles": [{"filename": "<string>", "content": "<hcl string>"}],
  "architectureDiagram": "<ascii string>",
  "costEstimate": "<markdown string>",
  "complianceChecklist": "<markdown string>",
  "deploymentGuide": "<markdown string>"
}
"""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _topology_to_prompt(topology) -> str:
    """Convert React Flow canvas topology to a natural language prompt."""
    node_lines = [
        f"  - {n.type.upper()} '{n.label}'" + (f" ({json.dumps(n.config)})" if n.config else "")
        for n in topology.nodes
    ]
    edge_lines = [
        f"  - {e.source} → {e.target}" + (f" ({e.label})" if e.label else "")
        for e in topology.edges
    ]
    parts = [f"Generate Terraform for the following AWS infrastructure in region {topology.region}:"]
    if node_lines:
        parts.append("Services:\n" + "\n".join(node_lines))
    if edge_lines:
        parts.append("Connections:\n" + "\n".join(edge_lines))
    return "\n\n".join(parts)


async def _call_claude_structured(prompt: str) -> tuple[dict, int, int]:
    """
    Call Claude claude-sonnet-4-6 and return (parsed_json, tokens_used, latency_ms).

    Raises HTTPException 502 on API errors.
    """
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ANTHROPIC_API_KEY is not configured",
        )

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    full_prompt = prompt + "\n\n" + _RESPONSE_SCHEMA_PROMPT

    t0 = time.monotonic()
    try:
        message = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8096,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": full_prompt}],
        )
    except anthropic.APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Claude API error: {exc}",
        )

    latency_ms = int((time.monotonic() - t0) * 1000)
    tokens_used = message.usage.input_tokens + message.usage.output_tokens

    raw = message.content[0].text.strip()
    # Strip markdown fences if Claude wraps the JSON anyway
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Claude returned non-JSON response: {exc}",
        )

    return data, tokens_used, latency_ms


async def _log_conversation(
    db: AsyncSession,
    project_id: uuid.UUID,
    session_id: str,
    turn_index: int,
    prompt: str,
    response: str,
    tokens_used: int,
    latency_ms: int,
) -> None:
    record = LlmConversation(
        id=uuid.uuid4(),
        project_id=project_id,
        session_id=session_id,
        turn_index=turn_index,
        role="assistant",
        model_used="claude-sonnet-4-6",
        prompt_text=prompt,
        response_text=response,
        tokens_used=tokens_used,
        latency_ms=latency_ms,
    )
    db.add(record)
    await db.flush()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/generate",
    response_model=IacGenerateResponse,
    summary="Generate Terraform via Claude",
    description=(
        "Runs Claude's 7-step IaC generation pipeline. "
        "Accepts either a natural language `prompt` (DashboardView) "
        "or a `canvas_topology` from React Flow (CanvasView). "
        "Returns structured JSON with Terraform files, architecture diagram, "
        "cost estimate, compliance checklist, and deployment guide."
    ),
)
async def generate_iac(
    body: IacGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> IacGenerateResponse:
    # Validate project ownership
    proj_result = await db.execute(
        select(Project).where(
            Project.id == body.project_id,
            Project.owner_id == current_user.id,
            Project.is_active.is_(True),
        )
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if not body.prompt and not body.canvas_topology:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Supply either 'prompt' or 'canvas_topology'",
        )

    user_prompt = body.prompt or _topology_to_prompt(body.canvas_topology)
    session_id = body.session_id or str(uuid.uuid4())

    data, tokens_used, latency_ms = await _call_claude_structured(user_prompt)

    # Build terraform files list
    tf_files = [
        TerraformFile(filename=f["filename"], content=f["content"])
        for f in data.get("terraformFiles", [])
    ]

    # Persist generated template (store full response JSON as content)
    template = IacTemplate(
        id=uuid.uuid4(),
        project_id=body.project_id,
        template_type="terraform",
        content=json.dumps(data),
        language="hcl",
        created_by_llm=True,
        llm_session_id=session_id,
        is_active=True,
    )
    db.add(template)
    await db.flush()

    # Audit log
    await _log_conversation(
        db=db,
        project_id=body.project_id,
        session_id=session_id,
        turn_index=0,
        prompt=user_prompt,
        response=json.dumps(data),
        tokens_used=tokens_used,
        latency_ms=latency_ms,
    )

    return IacGenerateResponse(
        template_id=template.id,
        session_id=session_id,
        parsed_requirements=data.get("parsedRequirements", ""),
        architecture_design=data.get("architectureDesign", ""),
        terraform_files=tf_files,
        architecture_diagram=data.get("architectureDiagram", ""),
        cost_estimate=data.get("costEstimate", ""),
        compliance_checklist=data.get("complianceChecklist", ""),
        deployment_guide=data.get("deploymentGuide", ""),
        model_used="claude-sonnet-4-6",
        tokens_used=tokens_used,
        latency_ms=latency_ms,
    )


@router.post(
    "/validate",
    response_model=IacValidateResponse,
    summary="Validate Terraform code",
    description=(
        "Runs `terraform validate` against the supplied HCL in a temporary directory. "
        "Requires the `terraform` CLI to be available on PATH. "
        "Returns validation result with stdout/stderr output."
    ),
)
async def validate_iac(
    body: IacValidateRequest,
    _: User = Depends(require_auth),
) -> IacValidateResponse:
    with tempfile.TemporaryDirectory() as tmpdir:
        tf_path = Path(tmpdir) / "main.tf"
        tf_path.write_text(body.terraform_code, encoding="utf-8")

        # terraform init -backend=false is required before validate
        init_result = subprocess.run(
            ["terraform", "init", "-backend=false", "-no-color"],
            cwd=tmpdir,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if init_result.returncode != 0:
            return IacValidateResponse(
                valid=False,
                output=f"terraform init failed:\n{init_result.stderr}",
                exit_code=init_result.returncode,
            )

        validate_result = subprocess.run(
            ["terraform", "validate", "-no-color"],
            cwd=tmpdir,
            capture_output=True,
            text=True,
            timeout=30,
        )

    output = validate_result.stdout or validate_result.stderr
    return IacValidateResponse(
        valid=validate_result.returncode == 0,
        output=output.strip(),
        exit_code=validate_result.returncode,
    )


@router.get(
    "/templates/{project_id}",
    response_model=list[IacTemplateOut],
    summary="List IaC templates for a project",
    description="Returns all active Terraform templates generated for the project, ordered by creation date descending.",
)
async def list_templates(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> list[IacTemplateOut]:
    # Verify project ownership
    proj = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id,
            Project.is_active.is_(True),
        )
    )
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    result = await db.execute(
        select(IacTemplate)
        .where(
            IacTemplate.project_id == project_id,
            IacTemplate.template_type == "terraform",
            IacTemplate.is_active.is_(True),
        )
        .order_by(IacTemplate.created_at.desc())
    )
    templates = result.scalars().all()
    return [IacTemplateOut.model_validate(t) for t in templates]


@router.get(
    "/templates/{project_id}/{template_id}",
    response_model=IacTemplateDetail,
    summary="Get a specific IaC template",
    description="Returns a single IaC template including its full HCL content.",
)
async def get_template(
    project_id: uuid.UUID,
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> IacTemplateDetail:
    # Verify project ownership
    proj = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id,
            Project.is_active.is_(True),
        )
    )
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    result = await db.execute(
        select(IacTemplate).where(
            IacTemplate.id == template_id,
            IacTemplate.project_id == project_id,
            IacTemplate.is_active.is_(True),
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    return IacTemplateDetail.model_validate(template)
