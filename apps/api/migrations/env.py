import asyncio

from alembic import context
from sqlalchemy.ext.asyncio import AsyncEngine

from afterhours.core.config import get_settings
from afterhours.core.db import build_engine
from afterhours.models import Base

config = context.config
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run(connection) -> None:  # type: ignore[no-untyped-def]
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def _run_async(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        await connection.run_sync(_do_run)
    await engine.dispose()


def run_migrations_online() -> None:
    # Tests pass an existing connection via config.attributes to migrate their own database.
    connection = config.attributes.get("connection")
    if connection is not None:
        _do_run(connection)
    else:
        asyncio.run(_run_async(build_engine(get_settings())))


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
