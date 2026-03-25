# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""LlmConversation ORM model — full Claude prompt/response audit trail."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LlmConversation(Base):
    """
    Audit record for every Claude claude-sonnet-4-6 call.

    session_id groups multi-turn refinement chains.
    turn_index orders messages within a session.
    """

    __tablename__ = "llm_conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    turn_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    role: Mapped[str] = mapped_column(String(16), default="user", nullable=False)
    model_used: Mapped[str] = mapped_column(
        String(64), default="claude-sonnet-4-6", nullable=False
    )
    prompt_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    project: Mapped["Project"] = relationship(  # noqa: F821
        "Project", back_populates="llm_conversations", lazy="select"
    )
