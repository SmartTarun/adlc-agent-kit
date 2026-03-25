# Agent: kiran | Sprint: 01 | Date: 2026-03-16
"""Auth router — dummy username/password auth with JWT. OAuth deferred to Sprint-02."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def create_access_token(subject: str) -> tuple[str, int]:
    """Return (JWT string, expires_in_seconds)."""
    expire_minutes = settings.jwt_access_token_expire_minutes
    expire = datetime.now(tz=timezone.utc) + timedelta(minutes=expire_minutes)
    payload = {"sub": subject, "exp": expire, "iat": datetime.now(tz=timezone.utc)}
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, expire_minutes * 60



# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    description=(
        "Create a new InfraViz user with username, email, and password. "
        "For Sprint-01 this is plain username/password auth; OAuth is deferred."
    ),
)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> UserOut:
    # Check uniqueness
    existing = await db.execute(
        select(User).where(
            (User.username == body.username) | (User.email == body.email)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already registered",
        )

    user = User(
        id=uuid.uuid4(),
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return UserOut.model_validate(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login and obtain JWT",
    description=(
        "Authenticate with username and password. Returns a JWT bearer token "
        "valid for the configured expiry window."
    ),
)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account inactive"
        )

    token, expires_in = create_access_token(str(user.id))
    return TokenResponse(access_token=token, expires_in=expires_in)


# ---------------------------------------------------------------------------
# Reusable dependency (imported by other routers)
# ---------------------------------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=True)


async def require_auth(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    FastAPI dependency: decode Bearer JWT and return the authenticated User.

    Raises HTTP 401 if token is missing, expired, or invalid.
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise JWTError("Missing subject")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user
