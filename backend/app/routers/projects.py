# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""Projects router — workspace CRUD + canvas state persistence."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.iac_template import IacTemplate
from app.models.project import Project
from app.models.user import User
from app.routers.auth import require_auth
from app.schemas.project import (
    CanvasStateOut,
    CanvasStateUpdate,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"])


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=ProjectOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new project",
    description=(
        "Create a new InfraViz workspace project. "
        "The authenticated user becomes the owner."
    ),
)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> ProjectOut:
    project = Project(
        id=uuid.uuid4(),
        name=body.name,
        description=body.description,
        cloud_provider=body.cloud_provider,
        region=body.region,
        owner_id=current_user.id,
        is_active=True,
    )
    db.add(project)
    await db.flush()
    return ProjectOut.model_validate(project)


@router.get(
    "",
    response_model=list[ProjectOut],
    summary="List projects",
    description="Returns all active projects owned by the authenticated user, ordered by creation date descending.",
)
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> list[ProjectOut]:
    result = await db.execute(
        select(Project)
        .where(Project.owner_id == current_user.id, Project.is_active.is_(True))
        .order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()
    return [ProjectOut.model_validate(p) for p in projects]


@router.get(
    "/{project_id}",
    response_model=ProjectOut,
    summary="Get a project by ID",
    description="Returns a single project. Raises 404 if not found or not owned by the caller.",
)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> ProjectOut:
    project = await _get_owned_project(project_id, current_user.id, db)
    return ProjectOut.model_validate(project)


@router.put(
    "/{project_id}",
    response_model=ProjectOut,
    summary="Update a project",
    description="Partially update project name, description, or region.",
)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> ProjectOut:
    project = await _get_owned_project(project_id, current_user.id, db)

    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    if body.region is not None:
        project.region = body.region

    await db.flush()
    return ProjectOut.model_validate(project)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a project",
    description="Soft-deletes the project by setting is_active=False.",
)
async def delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> None:
    project = await _get_owned_project(project_id, current_user.id, db)
    project.is_active = False
    await db.flush()


# ---------------------------------------------------------------------------
# Canvas state
# ---------------------------------------------------------------------------

@router.put(
    "/{project_id}/canvas",
    response_model=CanvasStateOut,
    summary="Save canvas state",
    description=(
        "Persist the React Flow canvas topology (nodes + edges) for a project. "
        "Stored as an IacTemplate with template_type='canvas_state'. "
        "Overwrites any previously saved canvas state."
    ),
)
async def save_canvas(
    project_id: uuid.UUID,
    body: CanvasStateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> CanvasStateOut:
    await _get_owned_project(project_id, current_user.id, db)

    # Upsert: deactivate previous canvas_state templates
    existing = await db.execute(
        select(IacTemplate).where(
            IacTemplate.project_id == project_id,
            IacTemplate.template_type == "canvas_state",
            IacTemplate.is_active.is_(True),
        )
    )
    for old in existing.scalars().all():
        old.is_active = False

    canvas_json = json.dumps({"nodes": body.nodes, "edges": body.edges})
    template = IacTemplate(
        id=uuid.uuid4(),
        project_id=project_id,
        template_type="canvas_state",
        content=canvas_json,
        language="json",
        created_by_llm=False,
        is_active=True,
    )
    db.add(template)
    await db.flush()

    return CanvasStateOut(
        project_id=project_id,
        nodes=body.nodes,
        edges=body.edges,
        saved_at=template.created_at,
    )


@router.get(
    "/{project_id}/canvas",
    response_model=CanvasStateOut,
    summary="Load canvas state",
    description="Returns the most recently saved React Flow canvas topology for the project.",
)
async def load_canvas(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> CanvasStateOut:
    await _get_owned_project(project_id, current_user.id, db)

    result = await db.execute(
        select(IacTemplate)
        .where(
            IacTemplate.project_id == project_id,
            IacTemplate.template_type == "canvas_state",
            IacTemplate.is_active.is_(True),
        )
        .order_by(IacTemplate.created_at.desc())
        .limit(1)
    )
    template = result.scalar_one_or_none()

    if not template:
        return CanvasStateOut(project_id=project_id, nodes=[], edges=[])

    data = json.loads(template.content)
    return CanvasStateOut(
        project_id=project_id,
        nodes=data.get("nodes", []),
        edges=data.get("edges", []),
        saved_at=template.created_at,
    )


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

async def _get_owned_project(
    project_id: uuid.UUID,
    owner_id: uuid.UUID,
    db: AsyncSession,
) -> Project:
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == owner_id,
            Project.is_active.is_(True),
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project
