/**
 * Browser port of apps/api/src/afterhours/simulation/model.py, for the GitHub Pages demo.
 *
 * Same equations and parameters as the Python model; keep the two in step. The random
 * generator differs (seeded mulberry32 here, Python's Mersenne Twister there), so the
 * same seed does not produce the same park. Everything here is SIMULATED and fictional.
 */

export const OPEN_MINUTE = 9 * 60;
export const CLOSE_MINUTE = 22 * 60;
const RIDE_INTENT_PER_HOUR = 1.05;
const POPULARITY_EXPONENT = 1.4;
const WAIT_CAP_MINUTES = 180;

const EFFICIENCY: Record<string, number> = { operating: 1.0, delayed: 0.6 };
const ABANDON_PER_MINUTE: Record<string, number> = { down: 0.12, closed: 0.35, refurb: 1.0 };

export interface Rng {
  random(): number;
  gauss(mu: number, sigma: number): number;
  randint(lo: number, hi: number): number;
  choice<T>(items: readonly T[]): T;
}

/** Seeded PRNG (mulberry32) with the few helpers the model needs. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    random,
    gauss: (mu, sigma) => {
      const u = 1 - random(); // (0, 1], so log is finite
      return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
    },
    randint: (lo, hi) => lo + Math.floor(random() * (hi - lo + 1)),
    choice: (items) => items[Math.floor(random() * items.length)]!,
  };
}

export const isOpen = (minute: number) => minute >= OPEN_MINUTE && minute < CLOSE_MINUTE;

export function gateArrivalWeight(minute: number): number {
  if (!isOpen(minute)) return 0;
  const h = minute / 60;
  const morning = Math.exp(-(((h - 10.0) / 1.1) ** 2));
  const midday = 0.55 * Math.exp(-(((h - 13.5) / 2.0) ** 2));
  const evening = 0.35 * Math.exp(-(((h - 18.0) / 1.2) ** 2));
  return morning + midday + evening;
}

export function departureRatePerMinute(minute: number): number {
  if (!isOpen(minute)) return 0.08;
  const h = minute / 60;
  return 0.0008 + 0.006 / (1 + Math.exp(-(h - 19.5) * 1.6));
}

export interface RideConfig {
  riders_per_dispatch: number;
  dispatch_interval_s: number;
  popularity: number;
  status: string;
}

const capacityPerMinute = (c: RideConfig) => (c.riders_per_dispatch * 60) / c.dispatch_interval_s;
const efficiency = (c: RideConfig) => EFFICIENCY[c.status] ?? 0;
export const available = (c: RideConfig) => efficiency(c) > 0;

export interface RideStep {
  queue: number;
  wait_minutes: number | null;
  arrivals: number;
  served: number;
  balked: number;
}

export function poisson(rng: Rng, lam: number): number {
  if (lam <= 0) return 0;
  if (lam > 60) return Math.max(0, Math.round(rng.gauss(lam, Math.sqrt(lam))));
  const threshold = Math.exp(-lam);
  let k = 0;
  let p = 1;
  for (;;) {
    p *= rng.random();
    if (p <= threshold) return k;
    k += 1;
  }
}

export function postedWait(queue: number, c: RideConfig): number | null {
  if (!available(c)) return null;
  const rate = capacityPerMinute(c) * efficiency(c);
  const minutes = rate > 0 ? queue / rate : WAIT_CAP_MINUTES;
  if (minutes < 2.5) return queue > 0 ? 5 : 0;
  return Math.min(WAIT_CAP_MINUTES, Math.ceil(minutes / 5) * 5);
}

export function balkProbability(wait: number | null): number {
  if (wait === null) return 1;
  return Math.min(0.6, Math.max(0, (wait - 35) / 150));
}

export function stepRide(
  c: RideConfig,
  queue: number,
  demandPerMinute: number,
  dt: number,
  rng: Rng,
): RideStep {
  if (!available(c)) {
    const keep = Math.max(0, 1 - (ABANDON_PER_MINUTE[c.status] ?? 1)) ** dt;
    return { queue: Math.trunc(queue * keep), wait_minutes: null, arrivals: 0, served: 0, balked: 0 };
  }
  const wanting = poisson(rng, demandPerMinute * dt);
  const pBalk = balkProbability(postedWait(queue, c));
  let balked = 0;
  for (let i = 0; i < Math.min(wanting, 400); i++) if (rng.random() < pBalk) balked++;
  if (wanting > 400) balked = Math.round((balked * wanting) / 400);
  const joined = wanting - balked;

  const capacity = capacityPerMinute(c) * efficiency(c) * dt;
  const served = Math.trunc(Math.min(queue + joined, capacity));
  const newQueue = Math.max(0, queue + joined - served);
  return {
    queue: Math.trunc(newQueue),
    wait_minutes: postedWait(newQueue, c),
    arrivals: joined,
    served,
    balked,
  };
}

export function rideDemand(
  guests: number,
  configs: Record<string, RideConfig>,
  minute: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isOpen(minute)) {
    for (const slug of Object.keys(configs)) out[slug] = 0;
    return out;
  }
  const total = (guests * RIDE_INTENT_PER_HOUR) / 60;
  const weights: Record<string, number> = {};
  for (const [slug, c] of Object.entries(configs)) {
    if (available(c)) weights[slug] = c.popularity ** POPULARITY_EXPONENT;
  }
  const sum = Object.values(weights).reduce((s, w) => s + w, 0) || 1;
  for (const slug of Object.keys(configs)) out[slug] = (total * (weights[slug] ?? 0)) / sum;
  return out;
}

export interface GateStep {
  guests_in_park: number;
  arrivals: number;
  departures: number;
}

export function stepGate(
  guests: number,
  minute: number,
  dt: number,
  parkCapacity: number,
  rng: Rng,
  peakArrivalsPerMinute = 175,
): GateStep {
  const lam = peakArrivalsPerMinute * gateArrivalWeight(minute) * dt;
  const arrivals = Math.min(poisson(rng, lam), Math.max(0, parkCapacity - Math.trunc(guests)));
  const rate = departureRatePerMinute(minute);
  const departures = Math.trunc(Math.min(guests, guests * (1 - (1 - rate) ** dt)));
  return { guests_in_park: Math.trunc(guests + arrivals - departures), arrivals, departures };
}
