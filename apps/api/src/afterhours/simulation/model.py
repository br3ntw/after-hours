"""Discrete-time queueing model for Lanternfall Park. Pure functions, no I/O.

Everything this produces is SIMULATED and fictional. Parameters are invented for a
plausible demo, not calibrated against any real park. See ``docs/simulation.md`` for the
assumptions and limitations.

Model, per tick of ``dt`` simulated minutes:

* Park gate: guests arrive along a time-of-day curve and leave at a rate that rises
  through the evening. Arrivals stop at park capacity.
* Ride demand: each guest in the park looks for a ride ``RIDE_INTENT_PER_HOUR`` times an
  hour. That demand is split across *available* attractions by popularity^1.4 (headliners
  draw disproportionately), so closing a ride pushes its guests elsewhere.
* Arrivals at a ride are Poisson around that rate. Guests balk (walk away) with a
  probability that grows with the posted wait.
* Service: riders_per_dispatch × dispatches in dt × efficiency, where efficiency is 1.0
  when operating, 0.6 when delayed, and 0 otherwise.
* Down/closed rides keep no line: a share of the queue abandons each minute.
* Posted wait = queue ÷ hourly-capacity-per-minute, rounded up to 5 like real signage,
  capped at 180.
"""

import math
import random
from dataclasses import dataclass

OPEN_MINUTE = 9 * 60  # 09:00
CLOSE_MINUTE = 22 * 60  # 22:00
RIDE_INTENT_PER_HOUR = 1.05  # ride attempts per guest-hour (tuned, see docs/simulation.md)
POPULARITY_EXPONENT = 1.4  # headliners draw disproportionately
WAIT_CAP_MINUTES = 180

EFFICIENCY = {"operating": 1.0, "delayed": 0.6}
ABANDON_PER_MINUTE = {"down": 0.12, "closed": 0.35, "refurb": 1.0}


def is_open(minute_of_day: float) -> bool:
    return OPEN_MINUTE <= minute_of_day < CLOSE_MINUTE


def gate_arrival_weight(minute_of_day: float) -> float:
    """Relative park-entry rate: a morning rush, a midday lull, and an evening bump
    before the night show. Zero outside opening hours."""
    if not is_open(minute_of_day):
        return 0.0
    h = minute_of_day / 60
    morning = math.exp(-(((h - 10.0) / 1.1) ** 2))
    midday = 0.55 * math.exp(-(((h - 13.5) / 2.0) ** 2))
    evening = 0.35 * math.exp(-(((h - 18.0) / 1.2) ** 2))
    return morning + midday + evening


def departure_rate_per_minute(minute_of_day: float) -> float:
    """Share of in-park guests leaving per minute; climbs late in the day."""
    if not is_open(minute_of_day):
        return 0.08  # sweep the park after close
    h = minute_of_day / 60
    return 0.0008 + 0.006 / (1 + math.exp(-(h - 19.5) * 1.6))


@dataclass(frozen=True, slots=True)
class RideConfig:
    riders_per_dispatch: int
    dispatch_interval_s: int
    popularity: float
    status: str

    @property
    def capacity_per_minute(self) -> float:
        return self.riders_per_dispatch * 60 / self.dispatch_interval_s

    @property
    def efficiency(self) -> float:
        return EFFICIENCY.get(self.status, 0.0)

    @property
    def available(self) -> bool:
        return self.efficiency > 0


@dataclass(frozen=True, slots=True)
class RideStep:
    queue: int
    wait_minutes: int | None  # None = not running, no posted wait
    arrivals: int
    served: int
    balked: int


def poisson(rng: random.Random, lam: float) -> int:
    """Poisson sample; normal approximation for large λ keeps ticks cheap."""
    if lam <= 0:
        return 0
    if lam > 60:
        return max(0, round(rng.gauss(lam, math.sqrt(lam))))
    # Knuth
    threshold, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= threshold:
            return k
        k += 1


def posted_wait(queue: float, config: RideConfig) -> int | None:
    if not config.available:
        return None
    rate = config.capacity_per_minute * config.efficiency
    minutes = queue / rate if rate > 0 else WAIT_CAP_MINUTES
    if minutes < 2.5:
        return 5 if queue > 0 else 0
    return min(WAIT_CAP_MINUTES, int(math.ceil(minutes / 5) * 5))


def balk_probability(wait: int | None) -> float:
    if wait is None:
        return 1.0
    return min(0.6, max(0.0, (wait - 35) / 150))


def step_ride(
    config: RideConfig,
    queue: float,
    demand_per_minute: float,
    dt: float,
    rng: random.Random,
) -> RideStep:
    """Advance one attraction by ``dt`` simulated minutes."""
    if not config.available:
        keep = max(0.0, 1 - ABANDON_PER_MINUTE.get(config.status, 1.0)) ** dt
        return RideStep(queue=int(queue * keep), wait_minutes=None, arrivals=0, served=0, balked=0)

    wanting = poisson(rng, demand_per_minute * dt)
    p_balk = balk_probability(posted_wait(queue, config))
    balked = sum(1 for _ in range(min(wanting, 400)) if rng.random() < p_balk)
    if wanting > 400:  # scale the sampled balk share for very large arrival batches
        balked = round(balked * wanting / 400)
    joined = wanting - balked

    capacity = config.capacity_per_minute * config.efficiency * dt
    served = int(min(queue + joined, capacity))
    new_queue = max(0.0, queue + joined - served)
    return RideStep(
        queue=int(new_queue),
        wait_minutes=posted_wait(new_queue, config),
        arrivals=joined,
        served=served,
        balked=balked,
    )


def ride_demand(
    guests_in_park: float, configs: dict[str, RideConfig], minute_of_day: float
) -> dict[str, float]:
    """Split the park's ride-seeking demand (guests per minute) over available rides."""
    if not is_open(minute_of_day):
        return {slug: 0.0 for slug in configs}
    total = guests_in_park * RIDE_INTENT_PER_HOUR / 60
    weights = {s: c.popularity**POPULARITY_EXPONENT for s, c in configs.items() if c.available}
    weight_sum = sum(weights.values()) or 1.0
    return {s: total * weights.get(s, 0.0) / weight_sum for s in configs}


@dataclass(frozen=True, slots=True)
class GateStep:
    guests_in_park: int
    arrivals: int
    departures: int


def step_gate(
    guests_in_park: float,
    minute_of_day: float,
    dt: float,
    park_capacity: int,
    rng: random.Random,
    peak_arrivals_per_minute: float = 175.0,
) -> GateStep:
    lam = peak_arrivals_per_minute * gate_arrival_weight(minute_of_day) * dt
    arrivals = min(poisson(rng, lam), max(0, park_capacity - int(guests_in_park)))
    rate = departure_rate_per_minute(minute_of_day)
    departures = int(min(guests_in_park, guests_in_park * (1 - (1 - rate) ** dt)))
    return GateStep(
        guests_in_park=int(guests_in_park + arrivals - departures),
        arrivals=arrivals,
        departures=departures,
    )
