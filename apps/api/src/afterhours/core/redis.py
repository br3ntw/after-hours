"""Shared Redis client (connection-pooled)."""

from functools import lru_cache

from redis.asyncio import Redis

from afterhours.core.config import get_settings


@lru_cache
def get_redis() -> Redis:
    return Redis.from_url(
        get_settings().redis_url,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=5,
        health_check_interval=30,
    )
