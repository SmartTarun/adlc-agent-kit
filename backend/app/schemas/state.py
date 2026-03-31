# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""State file request/response schemas — Terraform state import and metadata."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class StateImportRequest(BaseModel):
    """
    Import a Terraform state file (.tfstate) for a project.

    For Sprint-01 the raw JSON content is accepted directly. In Sprint-02
    this will be replaced with an S3 presigned URL upload flow.
    """

    project_id: uuid.UUID
    state_content: str = Field(
        ..., description="Raw .tfstate JSON content", min_length=2
    )
    template_id: uuid.UUID | None = Field(
        None, description="Associated IaC template (optional)"
    )


class StateFileOut(BaseModel):
    """Terraform state file metadata record."""

    id: uuid.UUID
    project_id: uuid.UUID
    template_id: uuid.UUID | None
    state_version: int
    backend_type: str
    s3_bucket: str | None
    s3_key: str | None
    checksum: str | None
    resource_count: int | None
    status: str
    applied_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
