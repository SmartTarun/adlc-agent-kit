# Agent: rasool | Sprint: 01 | Date: 2026-03-16
"""DriftRecord ORM model — desired-vs-actual infrastructure state drift events."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DriftRecord(Base):
    """
    Desired-vs-actual state drift event for an individual resource.

    Detected when an imported .tfstate differs from the current infra_resources record.
    drift_summary JSONB holds the full diff payload (added/removed/changed attributes).

    severity values: 'low' | 'medium' | 'high' | 'critical'
    """

    __tablename__ = "drift_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("infra_resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    state_file_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("state_files.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    drift_summary: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    severity: Mapped[str] = mapped_column(
        String(16), default="medium", nullable=False, index=True
    )
    resolved: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
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
        "Project", back_populates="drift_records", lazy="select"
    )
    resource: Mapped["InfraResource"] = relationship(  # noqa: F821
        "InfraResource", back_populates="drift_records", lazy="select"
    )
    state_file: Mapped["StateFile | None"] = relationship(  # noqa: F821
        "StateFile", back_populates="drift_records", lazy="select"
    )
