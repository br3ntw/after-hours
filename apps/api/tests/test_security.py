import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from afterhours.auth.permissions import Role
from afterhours.auth.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from afterhours.core.config import get_settings
from afterhours.core.errors import AuthenticationError


def test_password_roundtrip() -> None:
    h = hash_password("s3cret-pass")
    assert h.startswith("$argon2id$")
    assert verify_password(h, "s3cret-pass")
    assert not verify_password(h, "wrong")


def test_missing_hash_never_verifies() -> None:
    assert not verify_password(None, "anything")


def test_access_token_roundtrip() -> None:
    uid = uuid.uuid4()
    claims = decode_access_token(
        create_access_token(uid, Role.ANALYST, get_settings()), get_settings()
    )
    assert claims.user_id == uid
    assert claims.role is Role.ANALYST


def test_expired_token_rejected() -> None:
    s = get_settings()
    past = datetime.now(UTC) - timedelta(hours=1)
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "role": "admin", "typ": "access", "iat": past, "exp": past},
        s.jwt_secret.get_secret_value(),
        "HS256",
    )
    with pytest.raises(AuthenticationError):
        decode_access_token(token, s)


def test_alg_none_rejected() -> None:
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "role": "admin", "typ": "access", "iat": 0, "exp": 9999999999},
        key=None,
        algorithm="none",
    )
    with pytest.raises(AuthenticationError):
        decode_access_token(token, get_settings())
