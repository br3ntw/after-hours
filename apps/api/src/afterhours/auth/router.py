from typing import Annotated

from fastapi import APIRouter, Cookie, Request, Response, status

from afterhours.auth import ratelimit, service
from afterhours.auth.deps import AppSettings, CurrentUser, DbSession
from afterhours.auth.models import User
from afterhours.auth.permissions import ROLE_PERMISSIONS
from afterhours.auth.schemas import DemoLoginRequest, LoginRequest, MeOut, TokenOut
from afterhours.auth.security import create_access_token
from afterhours.core.config import Settings
from afterhours.core.errors import AuthenticationError, NotFoundError
from afterhours.core.redis import get_redis

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "ah_refresh"
# The cookie is only ever sent to the auth endpoints, never to the rest of the API.
REFRESH_COOKIE_PATH = "/api/v1/auth"


def _me(user: User) -> MeOut:
    return MeOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        permissions=sorted(ROLE_PERMISSIONS[user.role]),
    )


def _token_response(
    response: Response, session: service.AuthSession, settings: Settings
) -> TokenOut:
    response.set_cookie(
        REFRESH_COOKIE,
        session.refresh_token,
        max_age=settings.refresh_token_ttl_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path=REFRESH_COOKIE_PATH,
    )
    return TokenOut(
        access_token=create_access_token(session.user.id, session.user.role, settings),
        expires_in=settings.access_token_ttl_seconds,
        user=_me(session.user),
    )


@router.post("/login")
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: DbSession,
    settings: AppSettings,
) -> TokenOut:
    redis = get_redis()
    ip = request.client.host if request.client else "unknown"
    await ratelimit.ensure_allowed(redis, body.email, ip, settings)
    try:
        session = await service.login(db, body.email, body.password, settings)
    except AuthenticationError:
        await ratelimit.record_failure(redis, body.email, ip, settings)
        raise
    await ratelimit.clear(redis, body.email, ip)
    return _token_response(response, session, settings)


@router.post("/demo-login")
async def demo_login(
    body: DemoLoginRequest, response: Response, db: DbSession, settings: AppSettings
) -> TokenOut:
    """One-click sign-in as a seeded demo user of the given role, for portfolio reviewers.
    Disabled unless ``AH_DEMO_LOGIN=true``, and never available in production."""
    if not settings.demo_login or settings.env == "prod":
        raise NotFoundError("Not found")
    session = await service.demo_login(db, body.role, settings)
    return _token_response(response, session, settings)


@router.post("/refresh")
async def refresh(
    response: Response,
    db: DbSession,
    settings: AppSettings,
    ah_refresh: Annotated[str | None, Cookie()] = None,
) -> TokenOut:
    if not ah_refresh:
        raise AuthenticationError("No refresh token")
    session = await service.refresh(db, ah_refresh, settings)
    return _token_response(response, session, settings)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response, db: DbSession, ah_refresh: Annotated[str | None, Cookie()] = None
) -> None:
    if ah_refresh:
        await service.logout(db, ah_refresh)
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)


@router.get("/demo-config")
async def demo_config(settings: AppSettings) -> dict[str, bool]:
    """Lets the sign-in page decide whether to show the one-click role picker."""
    return {"demo_login": settings.demo_login and settings.env != "prod"}


@router.get("/me")
async def me(user: CurrentUser) -> MeOut:
    return _me(user)
