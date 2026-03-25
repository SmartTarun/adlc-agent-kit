# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""Project ORM model — top-level IaC workspace container."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Project(Base):
    """Top-level container for all IaC artefacts, state files, and resources."""

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cloud_provider: Mapped[str] = mapped_column(String(32), default="aws", nullable=False)
    region: Mapped[str] = mapped_column(String(32), default="us-east-1", nullable=False)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    owner: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="projects", lazy="select"
    )
    iac_templates: Mapped[list["IacTemplate"]] = relationship(  # noqa: F821
        "IacTemplate", back_populates="project", cascade="all, delete-orphan", lazy="select"
    )
    state_files: Mapped[list["StateFile"]] = relationship(  # noqa: F821
        "StateFile", back_populates="project", cascade="all, delete-orphan", lazy="select"
    )
    llm_conversations: Mapped[list["LlmConversation"]] = relationship(  # noqa: F821
        "LlmConversation", back_populates="project", cascade="all, delete-orphan", lazy="select"
    )
