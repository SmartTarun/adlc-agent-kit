# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""LLM router — SSE streaming (TerminalView) + multi-turn refinement."""

import json
import time
import uuid
from collections.abc import AsyncGenerator

import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.iac_template import IacTemplate
from app.models.llm_conversation import LlmConversation
from app.models.project import Project
from app.models.user import User
from app.routers.auth import require_auth
from app.routers.iac import (
    _RESPONSE_SCHEMA_PROMPT,
    _SYSTEM_PROMPT,
    _call_claude_structured,
    _log_conversation,
)
from app.schemas.iac import IacGenerateResponse, TerraformFile
from app.schemas.llm import LlmRefineRequest, LlmStreamRequest

router = APIRouter(prefix="/llm", tags=["llm"])

_TERMINAL_SYSTEM_PROMPT = """You are InfraViz CLI, an expert Cloud Architect assistant. \
Answer infrastructure questions, explain Terraform concepts, review HCL code, \
and help with AWS architecture decisions. Be concise and use markdown formatting. \
For code examples, use fenced code blocks with the appropriate language tag."""


# ---------------------------------------------------------------------------
# SSE streaming — TerminalView
# ---------------------------------------------------------------------------

@router.post(
    "/stream",
    summary="Streaming chat (TerminalView)",
    description=(
        "Stream a Claude response as Server-Sent Events (SSE). "
        "Used by TerminalView for real-time markdown output. "
        "Each SSE event has the format: `data: {\"text\": \"<chunk>\"}`. "
        "The stream ends with `data: [DONE]`."
    ),
    response_class=StreamingResponse,
)
async def stream_llm(
    body: LlmStreamRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> StreamingResponse:
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ANTHROPIC_API_KEY is not configured",
        )

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

    session_id = body.session_id or str(uuid.uuid4())
    project_id = body.project_id
    prompt = body.prompt

    async def event_generator() -> AsyncGenerator[str, None]:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        full_response = []
        tokens_used = 0
        t0 = time.monotonic()

        try:
            async with client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=_TERMINAL_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                async for text in stream.text_stream:
                    full_response.append(text)
                    payload = json.dumps({"text": text})
                    yield f"data: {payload}\n\n"

                final = await stream.get_final_message()
                tokens_used = (
                    final.usage.input_tokens + final.usage.output_tokens
                )
        except anthropic.APIError as exc:
            error_payload = json.dumps({"error": str(exc)})
            yield f"data: {error_payload}\n\n"

        latency_ms = int((time.monotonic() - t0) * 1000)

        # Persist audit record — best effort, don't fail the stream
        try:
            async with db.begin_nested():
                record = LlmConversation(
                    id=uuid.uuid4(),
                    project_id=project_id,
                    session_id=session_id,
                    turn_index=0,
                    role="assistant",
                    model_used="claude-sonnet-4-6",
                    prompt_text=prompt,
                    response_text="".join(full_response),
                    tokens_used=tokens_used,
                    latency_ms=latency_ms,
                )
                db.add(record)
        except Exception:
            pass

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Multi-turn refinement
# ---------------------------------------------------------------------------

@router.post(
    "/refine",
    response_model=IacGenerateResponse,
    summary="Refine existing Terraform via follow-up instruction",
    description=(
        "Send a follow-up instruction to Claude within an existing generation session. "
        "Loads the previous template content as context and returns an updated "
        "7-step structured JSON response. Saves the new template version."
    ),
)
async def refine_iac(
    body: LlmRefineRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
) -> IacGenerateResponse:
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

    # Load existing template for context
    tmpl_result = await db.execute(
        select(IacTemplate).where(
            IacTemplate.id == body.template_id,
            IacTemplate.project_id == body.project_id,
            IacTemplate.is_active.is_(True),
        )
    )
    existing = tmpl_result.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    # Determine turn index for this session
    session_id = body.session_id or existing.llm_session_id or str(uuid.uuid4())
    turn_result = await db.execute(
        select(LlmConversation)
        .where(LlmConversation.session_id == session_id)
        .order_by(LlmConversation.turn_index.desc())
        .limit(1)
    )
    last_turn = turn_result.scalar_one_or_none()
    next_turn = (last_turn.turn_index + 1) if last_turn else 1

    # Build refinement prompt with prior context
    refine_prompt = (
        f"Here is the existing Terraform configuration:\n\n"
        f"{existing.content}\n\n"
        f"Refinement instruction: {body.instruction}\n\n"
        "Apply the instruction and regenerate the complete 7-step response."
    )

    data, tokens_used, latency_ms = await _call_claude_structured(refine_prompt)

    tf_files = [
        TerraformFile(filename=f["filename"], content=f["content"])
        for f in data.get("terraformFiles", [])
    ]

    # Persist new template version
    new_template = IacTemplate(
        id=uuid.uuid4(),
        project_id=body.project_id,
        template_type="terraform",
        content=json.dumps(data),
        version=existing.version + 1,
        language="hcl",
        created_by_llm=True,
        llm_session_id=session_id,
        is_active=True,
    )
    db.add(new_template)
    await db.flush()

    await _log_conversation(
        db=db,
        project_id=body.project_id,
        session_id=session_id,
        turn_index=next_turn,
        prompt=refine_prompt,
        response=json.dumps(data),
        tokens_used=tokens_used,
        latency_ms=latency_ms,
    )

    return IacGenerateResponse(
        template_id=new_template.id,
        session_id=session_id,
        parsed_requirements=data.get("parsedRequirements", ""),
        architecture_design=data.get("architectureDesign", ""),
        terraform_files=tf_files,
        architecture_diagram=data.get("architectureDiagram", ""),
        cost_estimate=data.get("costEstimate", ""),
        compliance_checklist=data.get("complianceChecklist", ""),
        deployment_guide=data.get("deploymentGuide", ""),
        model_used="claude-sonnet-4-6",
        tokens_used=tokens_used,
        latency_ms=latency_ms,
    )
