# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""Project request/response schemas — workspace CRUD."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    """Create a new InfraViz project (workspace)."""

    name: str = Field(..., min_length=1, max_length=128, examples=["my-vpc-infra"])
    description: str | None = Field(None, examples=["Production VPC with RDS and ALB"])
    cloud_provider: str = Field("aws", examples=["aws"])
    region: str = Field("us-east-1", examples=["us-east-1"])


class ProjectUpdate(BaseModel):
    """Partial update for a project."""

    name: str | None = Field(None, min_length=1, max_length=128)
    description: str | None = None
    region: str | None = None


class ProjectOut(BaseModel):
    """Project representation returned to clients."""

    id: uuid.UUID
    name: str
    description: str | None
    cloud_provider: str
    region: str
    owner_id: uuid.UUID | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CanvasStateUpdate(BaseModel):
    """Save React Flow canvas topology for a project."""

    nodes: list[dict[str, Any]] = Field(..., description="React Flow node objects")
    edges: list[dict[str, Any]] = Field(..., description="React Flow edge objects")


class CanvasStateOut(BaseModel):
    """Loaded canvas state."""

    project_id: uuid.UUID
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    saved_at: datetime | None = None
