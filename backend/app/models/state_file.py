# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""StateFile ORM model — Terraform state metadata. Content stored in S3."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class StateFile(Base):
    """
    Terraform state metadata record.

    Arjun decision (2026-03-16): state file *content* lives in S3.
    This table holds only the pointer (s3_bucket, s3_key) and metadata.
    For Sprint-01 demo the content field is stored directly (no S3 bucket deployed).
    """

    __tablename__ = "state_files"

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
    state_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    backend_type: Mapped[str] = mapped_column(String(32), default="s3", nullable=False)
    s3_bucket: Mapped[str | None] = mapped_column(String(255), nullable=True)
    s3_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    s3_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    applied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project: Mapped["Project"] = relationship(  # noqa: F821
        "Project", back_populates="state_files", lazy="select"
    )
    infra_resources: Mapped[list["InfraResource"]] = relationship(  # noqa: F821
        "InfraResource", back_populates="state_file", lazy="select"
    )
    drift_records: Mapped[list["DriftRecord"]] = relationship(  # noqa: F821
        "DriftRecord", back_populates="state_file", lazy="select"
    )
