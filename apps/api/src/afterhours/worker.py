"""Simulation worker: the single process that advances the park (ADR-0001).

Run with ``uv run afterhours-worker``. Safe to stop and restart: the simulated clock, guest
count, and queues are persisted, so the park resumes where it left off.
"""

import asyncio
import contextlib
import signal
import time

from prometheus_client import start_http_server
from redis.exceptions import LockError, RedisError

from afterhours import models  # noqa: F401 - register mappers
from afterhours.core.config import get_settings
from afterhours.core.db import get_engine, get_sessionmaker
from afterhours.core.logging import configure_logging, get_logger
from afterhours.core.redis import get_redis
from afterhours.observability.metrics import SIM_TICK_FAILURES, SIM_TICK_SECONDS
from afterhours.simulation import engine

log = get_logger("afterhours.worker")


async def run() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    start_http_server(settings.worker_metrics_port)  # Prometheus scrape target
    log.info(
        "worker.start",
        tick_seconds=settings.sim_tick_seconds,
        metrics_port=settings.worker_metrics_port,
    )
    redis = get_redis()
    while not stop.is_set():
        started = time.perf_counter()
        try:
            async with get_sessionmaker()() as db:
                with SIM_TICK_SECONDS.time():
                    state = await engine.tick(db, redis)
            if state is not None and state.tick % 30 == 0:
                log.info(
                    "worker.tick",
                    tick=state.tick,
                    sim_time=state.sim_time.isoformat(),
                    guests=state.guests_in_park,
                    speed=state.speed,
                )
        except (LockError, RedisError) as exc:
            log.warning("worker.tick_skipped", error=str(exc))
        except Exception:  # keep the park running; one bad tick must not kill the worker
            SIM_TICK_FAILURES.inc()
            log.exception("worker.tick_failed")
        elapsed = time.perf_counter() - started
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(
                stop.wait(), timeout=max(0.0, settings.sim_tick_seconds - elapsed)
            )

    log.info("worker.stop")
    await redis.aclose()
    await get_engine().dispose()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
