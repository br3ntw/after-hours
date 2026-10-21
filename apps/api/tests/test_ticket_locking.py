"""Ticket state changes take a row lock, so back-to-back actions serialise.

Without the lock, "Assign" and then "Start work" sent before the first finished both read
the open ticket, and the version check rejected the second (seen in CI on a slow runner).
Uses its own connections: the per-test harness shares one connection, so it can't
observe a lock held by another transaction.
"""

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from afterhours.attractions.models import Attraction
from afterhours.maintenance import service
from afterhours.maintenance.models import (
    IssueType,
    MaintenanceTicket,
    Severity,
    TicketSource,
    TicketState,
)


async def test_state_changes_lock_the_ticket_row(engine: AsyncEngine) -> None:
    async with AsyncSession(engine, expire_on_commit=False) as setup:
        attraction = await setup.scalar(select(Attraction).limit(1))
        assert attraction is not None
        ticket = MaintenanceTicket(
            attraction_id=attraction.id,
            title="Lock test",
            issue_type=IssueType.OTHER,
            severity=Severity.SEV4,
            state=TicketState.OPEN,
            source=TicketSource.OPERATOR,
        )
        setup.add(ticket)
        await setup.commit()
        ticket_id = ticket.id

    try_lock = (
        select(MaintenanceTicket.id)
        .where(MaintenanceTicket.id == ticket_id)
        .with_for_update(nowait=True)
    )
    try:
        async with AsyncSession(engine) as first, AsyncSession(engine) as second:
            await service.get_ticket(first, ticket_id, lock=True)
            with pytest.raises(DBAPIError, match="could not obtain lock"):
                await second.execute(try_lock)
            await second.rollback()

            await first.rollback()  # releases the lock
            assert await second.scalar(try_lock) == ticket_id
            await second.rollback()
    finally:
        async with AsyncSession(engine) as cleanup:
            await cleanup.execute(
                delete(MaintenanceTicket).where(MaintenanceTicket.id == ticket_id)
            )
            await cleanup.commit()
