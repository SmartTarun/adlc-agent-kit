# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""LLM streaming and refinement schemas — TerminalView SSE + multi-turn refinement."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class LlmStreamRequest(BaseModel):
    """
    Request body for POST /llm/stream (TerminalView SSE endpoint).

    The response is a text/event-stream of SSE events rather than JSON.
    """

    project_id: uuid.UUID
    prompt: str = Field(..., min_length=1, description="Natural language command or question")
    session_id: str | None = Field(
        None, description="Session ID for conversation continuity"
    )


class LlmRefineRequest(BaseModel):
    """
    Request body for POST /llm/refine.

    Sends a follow-up instruction to Claude within an existing generation session,
    returning an updated 7-step structured JSON response.
    """

    project_id: uuid.UUID
    template_id: uuid.UUID = Field(..., description="Existing IaC template to refine")
    instruction: str = Field(
        ...,
        min_length=1,
        description="Refinement instruction (e.g. 'Add a CloudFront distribution')",
        examples=["Add a CloudFront distribution in front of the S3 bucket"],
    )
    session_id: str | None = Field(
        None, description="Session ID to continue the conversation"
    )


class LlmConversationOut(BaseModel):
    """LLM conversation audit record."""

    id: uuid.UUID
    project_id: uuid.UUID
    session_id: str
    turn_index: int
    role: str
    model_used: str
    tokens_used: int | None
    latency_ms: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
