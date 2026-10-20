"""Password hashing (argon2id) and token primitives."""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from afterhours.auth.permissions import Role
from afterhours.core.config import Settings
from afterhours.core.errors import AuthenticationError

_hasher = PasswordHasher()  # argon2id with library-recommended parameters

# Verified against when the email is unknown, so a login for a missing account costs the
# same as one for a real account (prevents user enumeration by timing).
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        _hasher.verify(password_hash or _DUMMY_HASH, password)
    except (VerificationError, InvalidHashError):
        return False
    return password_hash is not None


@dataclass(frozen=True, slots=True)
class AccessClaims:
    user_id: uuid.UUID
    role: Role


def create_access_token(user_id: uuid.UUID, role: Role, settings: Settings) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role.value,
        "typ": "access",
        "iat": now,
        "exp": now + timedelta(seconds=settings.access_token_ttl_seconds),
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), settings.jwt_algorithm)


def decode_access_token(token: str, settings: Settings) -> AccessClaims:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp", "iat", "typ"]},
        )
        if payload["typ"] != "access":
            raise AuthenticationError("Wrong token type")
        return AccessClaims(user_id=uuid.UUID(payload["sub"]), role=Role(payload["role"]))
    except (jwt.PyJWTError, ValueError, KeyError) as exc:
        raise AuthenticationError("Invalid or expired access token") from exc


def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    # Refresh tokens are high-entropy random values, so a fast hash is appropriate here.
    return hashlib.sha256(token.encode()).hexdigest()
