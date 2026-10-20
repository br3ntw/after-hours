"""FastAPI dependencies that authenticate the caller and enforce permissions."""

from collections.abc import Awaitable, Callable
from typing import Annotated

import structlog
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from afterhours.auth.models import User
from afterhours.auth.permissions import Permission, has_permission
from afterhours.auth.security import decode_access_token
from afterhours.core.config import Settings, get_settings
from afterhours.core.db import get_session
from afterhours.core.errors import AuthenticationError, PermissionDeniedError

_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_session)]
AppSettings = Annotated[Settings, Depends(get_settings)]


async def get_current_user(
    db: DbSession,
    settings: AppSettings,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise AuthenticationError("Missing bearer token")
    claims = decode_access_token(credentials.credentials, settings)
    # Re-read the user so deactivation and role changes take effect before token expiry.
    user = await db.get(User, claims.user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("Account not found or disabled")
    structlog.contextvars.bind_contextvars(user_id=str(user.id))
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require(permission: Permission) -> Callable[[User], Awaitable[User]]:
    """Dependency factory: ``user: User = Depends(require(Permission.X))``."""

    async def _check(user: CurrentUser) -> User:
        if not has_permission(user.role, permission):
            raise PermissionDeniedError(f"Requires permission '{permission.value}'")
        return user

    return _check
