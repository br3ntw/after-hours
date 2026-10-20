"""Async SQLAlchemy engine, session factory, and declarative base."""

from collections.abc import AsyncIterator
from datetime import datetime
from enum import StrEnum
from functools import lru_cache
from typing import Any

from sqlalchemy import DateTime, Enum, MetaData, func
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from afterhours.core.config import Settings, get_settings

# Deterministic constraint names keep Alembic autogenerate diffs stable.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {datetime: DateTime(timezone=True)}  # noqa: RUF012


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


def str_enum(enum: type[StrEnum], name: str | None = None, length: int = 24) -> Enum:
    """VARCHAR + CHECK instead of a native PG enum: adding a value later is a simple
    constraint swap rather than an ALTER TYPE that can't run inside a transaction."""
    return Enum(
        enum,
        # Name the CHECK after the column when a table has two columns of one enum,
        # otherwise both constraints would get the same convention name.
        name=name or enum.__name__.lower(),
        native_enum=False,
        length=length,
        create_constraint=True,
        values_callable=lambda e: [m.value for m in e],
    )


def build_engine(settings: Settings) -> AsyncEngine:
    connect_args: dict[str, Any] = {}
    if settings.database_ssl:
        connect_args["ssl"] = "require"
    if settings.database_disable_statement_cache:
        connect_args["statement_cache_size"] = 0
    return create_async_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=10,
        connect_args=connect_args,
    )


@lru_cache
def get_engine() -> AsyncEngine:
    return build_engine(get_settings())


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request; services decide when to commit."""
    async with get_sessionmaker()() as session:
        yield session
