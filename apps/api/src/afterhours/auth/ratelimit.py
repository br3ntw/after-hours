"""Failed sign-on throttling (Redis fixed window).

Keyed by (email, client IP), not email alone: keying on the account would let anyone lock a
real user out from elsewhere; keying on IP alone would let one IP walk through many
accounts slowly. Only *failures* count, and a successful sign-on clears the counter.
"""

import hashlib

from redis.asyncio import Redis

from afterhours.core.config import Settings
from afterhours.core.errors import RateLimitedError


def _key(email: str, ip: str) -> str:
    digest = hashlib.sha256(f"{email.lower()}|{ip}".encode()).hexdigest()[:32]
    return f"ah:login-fail:{digest}"  # hashed: no emails stored in Redis


async def ensure_allowed(redis: Redis, email: str, ip: str, settings: Settings) -> None:
    key = _key(email, ip)
    failures = int(await redis.get(key) or 0)
    if failures >= settings.login_max_failures:
        retry_after = max(1, int(await redis.ttl(key)))
        raise RateLimitedError(
            "Too many failed sign-on attempts. Try again later.",
            details={"retry_after_seconds": retry_after},
            headers={"Retry-After": str(retry_after)},
        )


async def record_failure(redis: Redis, email: str, ip: str, settings: Settings) -> None:
    key = _key(email, ip)
    async with redis.pipeline(transaction=True) as pipe:
        pipe.incr(key)
        pipe.expire(key, settings.login_failure_window_seconds, nx=True)
        await pipe.execute()


async def clear(redis: Redis, email: str, ip: str) -> None:
    await redis.delete(_key(email, ip))
