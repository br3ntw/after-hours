import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from afterhours.audit.service import record
from afterhours.auth.models import RefreshToken, User
from afterhours.auth.permissions import Role
from afterhours.auth.security import (
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from afterhours.core.config import Settings
from afterhours.core.errors import AuthenticationError, RefreshSupersededError
from afterhours.core.logging import get_logger

log = get_logger(__name__)

# Two tabs refreshing at the same instant both present the same cookie; the loser of that
# race must not be mistaken for an attacker replaying a stolen token.
REUSE_GRACE = timedelta(seconds=10)


@dataclass(frozen=True, slots=True)
class AuthSession:
    user: User
    refresh_token: str


async def _issue_refresh(
    db: AsyncSession, user: User, settings: Settings, family_id: uuid.UUID | None = None
) -> str:
    raw = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            family_id=family_id or uuid.uuid4(),
            token_hash=hash_refresh_token(raw),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_ttl_days),
        )
    )
    return raw


async def login(db: AsyncSession, email: str, password: str, settings: Settings) -> AuthSession:
    user = await db.scalar(select(User).where(User.email == email.lower()))
    # verify_password runs even when the user is missing (constant-time-ish response).
    ok = verify_password(user.password_hash if user else None, password)
    if not ok or user is None or not user.is_active:
        log.info("auth.login_failed", email_domain=email.rsplit("@", 1)[-1])
        raise AuthenticationError("Invalid email or password")

    raw = await _issue_refresh(db, user, settings)
    record(db, actor_id=user.id, action="auth.login", entity_type="user", entity_id=str(user.id))
    await db.commit()
    return AuthSession(user=user, refresh_token=raw)


async def demo_login(db: AsyncSession, role: Role, settings: Settings) -> AuthSession:
    """Sign in as the first active seeded user with ``role`` (demo mode only; the router
    guards availability). The user still gets normal tokens and normal RBAC."""
    user = await db.scalar(
        select(User)
        .where(User.role == role, User.is_active.is_(True), User.email.like("%@afterhours.test"))
        .order_by(User.created_at)
        .limit(1)
    )
    if user is None:
        raise AuthenticationError("No demo user for that role; run the seed")
    raw = await _issue_refresh(db, user, settings)
    record(
        db, actor_id=user.id, action="auth.demo_login", entity_type="user", entity_id=str(user.id)
    )
    await db.commit()
    return AuthSession(user=user, refresh_token=raw)


async def refresh(db: AsyncSession, raw_token: str, settings: Settings) -> AuthSession:
    """Rotate a refresh token. Reuse of an already-rotated token revokes the whole family."""
    now = datetime.now(UTC)
    token = await db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw_token))
        .with_for_update()  # serialise concurrent refreshes of the same token
    )
    if token is None:
        raise AuthenticationError("Invalid refresh token")

    if token.revoked_at is not None and now - token.revoked_at < REUSE_GRACE:
        raise RefreshSupersededError("Refresh token was just rotated; retry")

    if token.revoked_at is not None:
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == token.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        record(
            db,
            actor_id=token.user_id,
            action="auth.refresh_reuse_detected",
            entity_type="user",
            entity_id=str(token.user_id),
        )
        await db.commit()
        log.warning("auth.refresh_reuse_detected", user_id=str(token.user_id))
        raise AuthenticationError("Refresh token reuse detected; please sign in again")

    if token.expires_at <= now:
        raise AuthenticationError("Refresh token expired")

    user = await db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("Account disabled")

    token.revoked_at = now
    raw = await _issue_refresh(db, user, settings, family_id=token.family_id)
    await db.commit()
    return AuthSession(user=user, refresh_token=raw)


async def logout(db: AsyncSession, raw_token: str) -> None:
    token = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
    )
    if token is not None and token.revoked_at is None:
        # Revoke the family so sibling tokens from earlier rotations die too.
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == token.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        record(
            db,
            actor_id=token.user_id,
            action="auth.logout",
            entity_type="user",
            entity_id=str(token.user_id),
        )
        await db.commit()
