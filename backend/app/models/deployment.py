# Agent: rasool | Sprint: 01 | Date: 2026-03-16
"""Deployment ORM model — Terraform execution run history per template."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Deployment(Base):
    """
    Terraform execution run history.

    Sprint-01 scope: action defaults to 'validate' (generate + validate only).
    apply / destroy deferred to Sprint-02 per Arjun decision 2026-03-16.

    action values:  'validate' | 'plan' | 'apply' | 'destroy'
    status values:  'pending' | 'running' | 'success' | 'failed'
    """

    __tablename__ = "deployments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("iac_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    state_file_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("state_files.id", ondelete="SET NULL"),
        nullable=True,
    )
    deployed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(
        String(32), default="validate", nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(32), default="pending", nullable=False, index=True
    )
    logs: Mapped[str | None] = mapped_column(Text, nullable=True)
    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    project: Mapped["Project"] = relationship(  # noqa: F821
        "Project", back_populates="deployments", lazy="select"
    )
    template: Mapped["IacTemplate | None"] = relationship(  # noqa: F821
        "IacTemplate", back_populates="deployments", lazy="select"
    )
    deployer: Mapped["User | None"] = relationship(  # noqa: F821
        "User", back_populates="deployments", lazy="select"
    )
