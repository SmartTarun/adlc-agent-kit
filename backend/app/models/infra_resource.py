# Agent: rasool | Sprint: 01 | Date: 2026-03-16
"""InfraResource ORM model — AWS resources described or tracked per project."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InfraResource(Base):
    """
    Individual AWS resource described or discovered per project.

    config JSONB stores resource-specific properties (instance type, AMI, CIDR, etc.).
    status values: 'planned' | 'applied' | 'destroyed'
    AWS-only for Sprint-01; cloud_provider column prepared for multi-cloud Sprint-02.
    """

    __tablename__ = "infra_resources"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    state_file_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("state_files.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    resource_type: Mapped[str] = mapped_column(
        String(128), nullable=False, index=True
    )
    resource_name: Mapped[str] = mapped_column(String(255), nullable=False)
    cloud_provider: Mapped[str] = mapped_column(
        String(32), default="aws", nullable=False
    )
    region: Mapped[str] = mapped_column(
        String(32), default="us-east-1", nullable=False
    )
    account_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    config: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), default="planned", nullable=False, index=True
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(
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
        "Project", back_populates="infra_resources", lazy="select"
    )
    state_file: Mapped["StateFile | None"] = relationship(  # noqa: F821
        "StateFile", back_populates="infra_resources", lazy="select"
    )
    drift_records: Mapped[list["DriftRecord"]] = relationship(  # noqa: F821
        "DriftRecord", back_populates="resource", cascade="all, delete-orphan", lazy="select"
    )
