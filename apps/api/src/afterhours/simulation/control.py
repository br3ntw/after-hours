"""Demo-mode control state, shared by the API (writes) and the worker (reads each tick).

Stored as one Redis hash so a pause or speed change from any API replica takes effect on
the worker's next tick with no extra coordination.
"""

from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import cast

from redis.asyncio import Redis

from afterhours.core.config import get_settings
from afterhours.core.redis import get_redis

SPEEDS = (0.5, 1.0, 2.0, 5.0, 10.0)  # simulated minutes per tick
WARM_START = timedelta(hours=14)  # reset lands mid-day, with lines already built


def opening_day() -> datetime:
    today = datetime.now(UTC).date()
    return datetime(today.year, today.month, today.day, tzinfo=UTC)


@dataclass(frozen=True, slots=True)
class SimState:
    running: bool
    speed: float
    sim_time: datetime
    tick: int
    guests_in_park: int
    initialized: bool

    def as_dict(self) -> dict[str, object]:
        return {
            "running": self.running,
            "speed": self.speed,
            "sim_time": self.sim_time.isoformat(),
            "tick": self.tick,
            "guests_in_park": self.guests_in_park,
            "simulated": True,
        }


async def read_state(redis: Redis | None = None) -> SimState:
    r = redis or get_redis()
    raw = cast(dict[str, str], await r.hgetall(get_settings().sim_state_key))
    if raw.get("initialized") != "1":
        return SimState(
            running=raw.get("running", "0") == "1",
            speed=float(raw.get("speed", "1")),
            sim_time=opening_day() + WARM_START,
            tick=0,
            guests_in_park=0,
            initialized=False,
        )
    return SimState(
        running=raw.get("running") == "1",
        speed=float(raw.get("speed", "1")),
        sim_time=datetime.fromisoformat(raw["sim_time"]),
        tick=int(raw.get("tick", "0")),
        guests_in_park=int(raw.get("guests_in_park", "0")),
        initialized=True,
    )


async def write_state(state: SimState, redis: Redis | None = None) -> None:
    r = redis or get_redis()
    await r.hset(
        get_settings().sim_state_key,
        mapping={
            "running": "1" if state.running else "0",
            "speed": str(state.speed),
            "sim_time": state.sim_time.isoformat(),
            "tick": str(state.tick),
            "guests_in_park": str(state.guests_in_park),
            "initialized": "1" if state.initialized else "0",
        },
    )


async def set_running(running: bool, redis: Redis | None = None) -> SimState:
    # Always write the whole state: a partial hash would be unreadable. Controls never
    # mark the park initialised; only reset (the warm start) does.
    r = redis or get_redis()
    state = replace(await read_state(r), running=running)
    await write_state(state, r)
    return state


async def set_speed(speed: float, redis: Redis | None = None) -> SimState:
    if speed not in SPEEDS:
        raise ValueError(f"speed must be one of {SPEEDS}")
    r = redis or get_redis()
    state = replace(await read_state(r), speed=speed)
    await write_state(state, r)
    return state
