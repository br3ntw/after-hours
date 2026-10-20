# Wait-time simulation: model, assumptions, limitations

Everything the simulation produces is **fictional**. Its parameters are invented for a
believable demo; they are **not calibrated against any real park**. Every simulated value is
labeled "Simulated" in the UI and `simulated: true` in the API.

Code: [`apps/api/src/afterhours/simulation/model.py`](../apps/api/src/afterhours/simulation/model.py)
(pure functions) and [`engine.py`](../apps/api/src/afterhours/simulation/engine.py) (persistence,
incidents, events).

## Clock

- The worker ticks every `AH_SIM_TICK_SECONDS` (default 2 s of wall time).
- Each tick advances the **park clock** by the speed setting: ½, 1, 2, 5, or 10 simulated
  minutes. At 1× speed, the park clock runs 30× faster than real time.
- The park is open 09:00–22:00. Shortly after close the park empties and the clock jumps to
  08:45 the next day.
- **Warm start:** a reset fast-forwards silently from 08:45 to 14:00, so a new visitor sees
  lines and a morning of history instead of an empty park.

## Model (per tick of Δt simulated minutes)

| Stage | Rule |
|---|---|
| Gate | Arrivals ~ Poisson(175/min × time-of-day curve × Δt), capped at park capacity (45,000). The curve has a morning rush, a midday plateau, and a pre-show bump. Departures rise sharply after ~19:30. |
| Ride demand | Guests in park × 1.05 ride attempts per hour, split across *available* attractions by popularity^1.4. Closing a ride sends its demand elsewhere. |
| Arrivals at a ride | Poisson around that ride's demand. |
| Balking | A guest walks away with probability `clamp((wait − 35) / 150, 0, 0.6)`. |
| Service | `riders_per_dispatch × 60 / dispatch_interval_s × efficiency × Δt`. Efficiency is 1.0 when operating, 0.6 when delayed, and 0 otherwise. |
| Down / closed | No service. The queue abandons 12%/min (down) or 35%/min (closed). |
| Posted wait | `queue ÷ effective rate`, rounded **up** to 5 minutes like real signage, capped at 180. Not shown when the ride isn't running. |

**Incidents:**
- **Breakdowns** follow a per-type mean time between failures (coaster 2,400 simulated
  minutes, show 8,000). A breakdown opens a SIMULATION ticket: SEV1 takes the ride down;
  SEV2 sets it to delayed.
- **Short "guest-assist" delays** occur with a mean of 1,500 simulated minutes and clear after
  4–15 minutes.
- **Auto-repair:** simulation tickets are assigned after 3–8 minutes, started 2–6 minutes
  later, and resolved after 18–60 minutes (or the drill's chosen duration). The ride then
  reopens. If a person has already moved a ticket past a step, the simulation skips that step
  instead of fighting over it.

**Determinism:** each tick seeds its RNG from `(AH_SIM_SEED, tick number)`, so the model is
reproducible in tests.

## Calibration (actually run)

I ran a full park day through the model at Δt = 1 with all 24 attractions operating, and
tuned it in three passes:

1. **First pass.** Popularity weighting was linear, with 0.85 attempts/hour and peak gate
   arrivals of 260/min. The park sat at capacity all afternoon, and low-popularity flat rides
   had the longest lines. Wrong.
2. **Second pass.** Weighting was popularity^2.5. Headliners hit 80 minutes, but half the
   rides showed 0 all day. Wrong in the other direction.
3. **Kept.** Popularity^1.4, 1.05 attempts/hour, 175/min peak gate. Results: 15:00, average
   ~26 min with headliners ~75; 18:00, average ~50 with headliners ~100; about 32,500 guests
   at peak.

A regression test checks that warm-up throughput for a full line matches design capacity
within 15%.

## Limitations (deliberate)

- Guests aren't individuals. There's no routing between lands and no walking time.
- There are no virtual queues, skip-the-line systems, single-rider lines, or ride-photo
  dwell.
- Shows are modeled as rides with large batches. They have no fixed showtimes.
- There's no weather, no seasonality, and no special events.
- **MTTR has two clocks.** Tickets record the park clock when they open and resolve
  (`sim_opened_at` / `sim_resolved_at`), and the UI leads with park-time MTTR. Wall-clock MTTR
  is shown second, because the park clock runs 15–300× faster. Tickets created before those
  columns existed have only wall-clock times.
- **Uptime** comes from wall-clock status intervals over the last 24 hours.
