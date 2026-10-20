/**
 * The simulated park clock is stored as a UTC timestamp whose wall-clock fields *are* park
 * local time, so it is always formatted in UTC.
 */
const simClock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
const simHour = new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" });
const wallTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const wallDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const integer = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const formatSimClock = (iso: string) => simClock.format(new Date(iso));
export const formatSimHour = (iso: string) => simHour.format(new Date(iso)).replace(" ", "").toLowerCase();
export const formatWallTime = (iso: string) => wallTime.format(new Date(iso));
export const formatInt = (n: number) => integer.format(Math.round(n));
export const formatCompact = (n: number) => compact.format(n);

export function formatWallDateTime(iso: string): string {
  const d = new Date(iso);
  return `${wallDate.format(d)}, ${wallTime.format(d)}`;
}

export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export function formatDuration(fromIso: string, toIso: string | null, now: number = Date.now()): string {
  const end = toIso ? new Date(toIso).getTime() : now;
  const minutes = Math.max(0, Math.round((end - new Date(fromIso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `${h} h ${minutes % 60} min`;
}

export const formatWait = (minutes: number | null | undefined) =>
  minutes === null || minutes === undefined ? "—" : `${minutes} min`;
