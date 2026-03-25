# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""IaC generation and validation schemas — Claude 7-step pipeline."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Canvas topology input (from CanvasView)
# ---------------------------------------------------------------------------

class CanvasNode(BaseModel):
    """A single AWS service node on the React Flow canvas."""

    id: str
    type: str = Field(..., examples=["ec2", "rds", "s3", "vpc", "subnet"])
    label: str = Field(..., examples=["web-server"])
    config: dict[str, Any] = Field(default_factory=dict)


class CanvasEdge(BaseModel):
    """A connection between two canvas nodes."""

    source: str
    target: str
    label: str | None = None


class CanvasTopology(BaseModel):
    """Complete React Flow canvas topology submitted from CanvasView."""

    nodes: list[CanvasNode]
    edges: list[CanvasEdge]
    region: str = Field("us-east-1", examples=["us-east-1"])


# ---------------------------------------------------------------------------
# Generation request
# ---------------------------------------------------------------------------

class IacGenerateRequest(BaseModel):
    """
    Request body for POST /iac/generate.

    Supply either `prompt` (NL — Dashboard mode) or `canvas_topology`
    (React Flow topology — Canvas mode). At least one is required.
    """

    project_id: uuid.UUID
    prompt: str | None = Field(
        None,
        description="Natural language infrastructure description (DashboardView)",
        examples=["Create a VPC with public/private subnets, an EC2 web server, and RDS MySQL"],
    )
    canvas_topology: CanvasTopology | None = Field(
        None,
        description="React Flow canvas topology (CanvasView)",
    )
    region: str = Field("us-east-1", examples=["us-east-1"])
    session_id: str | None = Field(
        None, description="LLM session ID for multi-turn refinement"
    )


# ---------------------------------------------------------------------------
# Terraform file artefact
# ---------------------------------------------------------------------------

class TerraformFile(BaseModel):
    """A single generated Terraform file."""

    filename: str = Field(..., examples=["main.tf"])
    content: str = Field(..., description="HCL content of the file")


# ---------------------------------------------------------------------------
# Generation response — Claude 7-step pipeline
# ---------------------------------------------------------------------------

class IacGenerateResponse(BaseModel):
    """
    Structured response from Claude's 7-step IaC generation pipeline.

    Steps:
      1. parsedRequirements   — extracted infrastructure intent
      2. architectureDesign   — markdown architecture description
      3. terraformFiles       — array of generated HCL files
      4. architectureDiagram  — ASCII topology diagram
      5. costEstimate         — markdown cost breakdown
      6. complianceChecklist  — markdown AWS compliance notes
      7. deploymentGuide      — markdown step-by-step deployment instructions
    """

    template_id: uuid.UUID
    session_id: str
    parsed_requirements: str
    architecture_design: str
    terraform_files: list[TerraformFile]
    architecture_diagram: str
    cost_estimate: str
    compliance_checklist: str
    deployment_guide: str
    model_used: str = "claude-sonnet-4-6"
    tokens_used: int | None = None
    latency_ms: int | None = None


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

class IacValidateRequest(BaseModel):
    """Request body for POST /iac/validate."""

    terraform_code: str = Field(
        ..., description="HCL content to validate", min_length=1
    )
    project_id: uuid.UUID | None = None


class IacValidateResponse(BaseModel):
    """Terraform validation result."""

    valid: bool
    output: str = Field(..., description="terraform validate stdout/stderr or error message")
    exit_code: int


# ---------------------------------------------------------------------------
# Template listing
# ---------------------------------------------------------------------------

class IacTemplateOut(BaseModel):
    """IaC template summary."""

    id: uuid.UUID
    project_id: uuid.UUID
    template_type: str
    version: int
    language: str
    created_by_llm: bool
    llm_session_id: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IacTemplateDetail(IacTemplateOut):
    """IaC template with full content."""

    content: str
