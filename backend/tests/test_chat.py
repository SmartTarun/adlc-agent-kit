# Agent: kiran | Sprint: 01 | Date: 2026-03-28
"""Tests for /api/v1/chat (AI Deal Assistant) endpoints."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_chat_history_not_found(client):
    resp = await client.get(f"/api/v1/chat/history/{uuid.uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_chat_history_after_session_created(client, db_session):
    from app.models.cbre import ChatMessage, ChatSession

    sid = str(uuid.uuid4())
    session = ChatSession(session_id=sid)
    db_session.add(session)
    msg = ChatMessage(session_id=sid, role="user", content="What is the NOI for 1 Market St?")
    db_session.add(msg)
    await db_session.flush()

    resp = await client.get(f"/api/v1/chat/history/{sid}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == sid
    assert len(data["messages"]) >= 1
    assert data["messages"][0]["role"] == "user"


async def _mock_stream(*args, **kwargs):
    yield "data: Hello\n\n"
    yield "data: world\n\n"
    yield "data: [DONE]\n\n"


@pytest.mark.asyncio
async def test_chat_message_streams(client):
    sid = str(uuid.uuid4())
    with patch("app.routers.chat.stream_deal_assistant", side_effect=_mock_stream):
        resp = await client.post(
            "/api/v1/chat/message",
            json={"session_id": sid, "message": "What is the average cap rate?"},
        )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_chat_message_validates_empty(client):
    resp = await client.post(
        "/api/v1/chat/message",
        json={"session_id": "sid1", "message": ""},
    )
    assert resp.status_code == 422
