# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""Tests for /auth endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient) -> None:
    resp = await client.post(
        "/auth/register",
        json={
            "username": "newuser",
            "email": "newuser@infraviz.dev",
            "password": "password123",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "newuser"
    assert data["email"] == "newuser@infraviz.dev"
    assert "id" in data
    assert "hashed_password" not in data


@pytest.mark.asyncio
async def test_register_duplicate_username(client: AsyncClient, test_user: User) -> None:
    resp = await client.post(
        "/auth/register",
        json={
            "username": "testuser",
            "email": "other@infraviz.dev",
            "password": "password123",
        },
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_register_invalid_username(client: AsyncClient) -> None:
    resp = await client.post(
        "/auth/register",
        json={
            "username": "bad user!",
            "email": "bad@infraviz.dev",
            "password": "password123",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_user: User) -> None:
    resp = await client.post(
        "/auth/login",
        json={"username": "testuser", "password": "testpass123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] > 0


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, test_user: User) -> None:
    resp = await client.post(
        "/auth/login",
        json={"username": "testuser", "password": "wrongpassword"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user(client: AsyncClient) -> None:
    resp = await client.post(
        "/auth/login",
        json={"username": "nobody", "password": "password123"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_current_user(
    client: AsyncClient, test_user: User, auth_headers: dict
) -> None:
    resp = await client.get("/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "testuser"


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient) -> None:
    resp = await client.get("/auth/me")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_me_invalid_token(client: AsyncClient) -> None:
    resp = await client.get("/auth/me", headers={"Authorization": "Bearer invalidtoken"})
    assert resp.status_code == 401
