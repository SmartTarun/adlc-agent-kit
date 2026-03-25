# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""State file router — Terraform state import and metadata management."""

import hashlib
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project
from app.models.state_file import StateFile
from app.models.user import User
from app.routers.auth import require_auth
from app.schemas.state import StateFileOut, StateImportRequest

router = APIRouter(prefix="/state", tags=["state"])


@router.post(
    "/import",
    response_model=StateFileOut,
    status_code=status.HTTP_201_CREATED,
    summary="Import a Terraform state file",
    description=(
        "Accept a raw .tfstate JSON string and store its metadata in the database. "
        "For Sprint-01 the content is stored inline; Sprint-02 will upload to S3 and "
        "store only the S3 pointer. Extracts resource count from the state JSON."
    ),
)
async def import_state(
    body: StateImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> StateFileOut:
    # Verify project ownership
    proj = await db.execute(
        select(Project).where(
            Project.id == body.project_id,
            Project.owner_id == current_user.id,
            Project.is_active.is_(True),
        )
    )
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Validate and parse state JSON
    try:
        state_data = json.loads(body.state_content)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="state_content is not valid JSON",
        )

    # Extract resource count from .tfstate resources array
    resource_count: int | None = None
    if isinstance(state_data.get("resources"), list):
        resource_count = len(state_data["resources"])

    # Compute checksum of raw content
    checksum = hashlib.sha256(body.state_content.encode()).hexdigest()

    # Determine next version number
    existing = await db.execute(
        select(StateFile)
        .where(StateFile.project_id == body.project_id)
        .order_by(StateFile.state_version.desc())
        .limit(1)
    )
    latest = existing.scalar_one_or_none()
    next_version = (latest.state_version + 1) if latest else 1

    state_file = StateFile(
        id=uuid.uuid4(),
        project_id=body.project_id,
        template_id=body.template_id,
        state_version=next_version,
        backend_type="local",  # Sprint-01: inline storage; Sprint-02 uses S3
        checksum=checksum,
        resource_count=resource_count,
        status="active",
    )
    db.add(state_file)
    await db.flush()

    return StateFileOut.model_validate(state_file)


@router.get(
    "/{project_id}",
    response_model=list[StateFileOut],
    summary="List state files for a project",
    description="Returns all state file metadata records for the project, ordered by version descending.",
)
async def list_state_files(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> list[StateFileOut]:
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
        select(StateFile)
        .where(StateFile.project_id == project_id)
        .order_by(StateFile.state_version.desc())
    )
    files = result.scalars().all()
    return [StateFileOut.model_validate(f) for f in files]
