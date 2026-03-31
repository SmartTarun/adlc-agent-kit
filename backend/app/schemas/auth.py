# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""Auth request/response schemas — dummy username/password for Sprint-01."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    """Request body for user registration."""

    username: str = Field(..., min_length=3, max_length=64, examples=["admin"])
    email: EmailStr = Field(..., examples=["admin@infraviz.dev"])
    password: str = Field(..., min_length=6, max_length=128, examples=["secret123"])

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username must be alphanumeric (underscores/hyphens allowed)")
        return v.lower()


class LoginRequest(BaseModel):
    """Request body for login."""

    username: str = Field(..., examples=["admin"])
    password: str = Field(..., examples=["secret123"])


class TokenResponse(BaseModel):
    """JWT bearer token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Token lifetime in seconds")


class UserOut(BaseModel):
    """Public user representation."""

    id: uuid.UUID
    username: str
    email: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
