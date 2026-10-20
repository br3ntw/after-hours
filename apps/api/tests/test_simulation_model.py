"""Unit tests for the pure queueing model (no database, no Redis)."""

import random

import pytest

from afterhours.simulation import model
from afterhours.simulation.model import RideConfig

COASTER = RideConfig(
    riders_per_dispatch=24, dispatch_interval_s=60, popularity=0.9, status="operating"
)


def test_capacity_per_minute() -> None:
    assert COASTER.capacity_per_minute == 24


@pytest.mark.parametrize(
    ("minute", "expected"),
    [(8 * 60 + 59, False), (9 * 60, True), (21 * 60 + 59, True), (22 * 60, False)],
)
def test_opening_hours(minute: int, expected: bool) -> None:
    assert model.is_open(minute) is expected


def test_queue_grows_when_demand_exceeds_capacity() -> None:
    rng = random.Random(1)
    queue = 0.0
    for _ in range(30):
        queue = model.step_ride(COASTER, queue, demand_per_minute=40, dt=1, rng=rng).queue
    assert queue > 100


def test_queue_drains_when_demand_below_capacity() -> None:
    rng = random.Random(1)
    step = model.step_ride(COASTER, 200, demand_per_minute=0, dt=5, rng=rng)
    assert step.served == 24 * 5
    assert step.queue == 200 - 120


def test_down_ride_serves_nobody_and_loses_its_line() -> None:
    down = RideConfig(24, 60, 0.9, "down")
    step = model.step_ride(down, 500, demand_per_minute=50, dt=5, rng=random.Random(1))
    assert step.served == 0 and step.arrivals == 0
    assert step.wait_minutes is None
    assert step.queue < 500


def test_delayed_ride_runs_at_reduced_efficiency() -> None:
    delayed = RideConfig(24, 60, 0.9, "delayed")
    step = model.step_ride(delayed, 1000, demand_per_minute=0, dt=10, rng=random.Random(1))
    assert step.served == round(24 * 0.6 * 10)


def test_posted_wait_rounds_up_to_five_and_caps() -> None:
    assert model.posted_wait(0, COASTER) == 0
    assert model.posted_wait(24 * 12, COASTER) == 15  # 12 minutes → posted 15
    assert model.posted_wait(10**6, COASTER) == model.WAIT_CAP_MINUTES


def test_balking_rises_with_wait() -> None:
    assert model.balk_probability(10) == 0
    assert model.balk_probability(90) > model.balk_probability(60) > 0
    assert model.balk_probability(10_000) == 0.6


def test_closing_a_ride_redistributes_demand() -> None:
    configs = {"a": COASTER, "b": RideConfig(24, 60, 0.9, "operating")}
    both = model.ride_demand(10_000, configs, 12 * 60)
    configs["b"] = RideConfig(24, 60, 0.9, "closed")
    one = model.ride_demand(10_000, configs, 12 * 60)
    assert one["b"] == 0
    assert one["a"] == pytest.approx(both["a"] + both["b"])


def test_no_demand_outside_hours() -> None:
    assert set(model.ride_demand(5000, {"a": COASTER}, 23 * 60).values()) == {0.0}


def test_gate_respects_capacity() -> None:
    step = model.step_gate(44_990, 10 * 60, 60, 45_000, random.Random(1))
    assert step.guests_in_park <= 45_000


def test_model_is_deterministic_for_a_seed() -> None:
    a = model.step_ride(COASTER, 50, 30, 2, random.Random(42))
    b = model.step_ride(COASTER, 50, 30, 2, random.Random(42))
    assert a == b
