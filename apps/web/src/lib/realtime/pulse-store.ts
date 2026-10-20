import { useSyncExternalStore } from "react";

/**
 * Remembers which entities just changed, so every view showing that entity (map marker,
 * KPI, feed row) can play the same one-shot pulse. This is the signature move.
 */
const pulses = new Map<string, number>();
const listeners = new Set<() => void>();

export function pulse(key: string): void {
  pulses.set(key, (pulses.get(key) ?? 0) + 1);
  listeners.forEach((l) => l());
}

/** Current pulse count for a key (non-hook read, used by usePulse and tests). */
export const pulseCount = (key: string): number => pulses.get(key) ?? 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Increments each time `key` pulses. Use it as a React `key` to replay a CSS animation. */
export function usePulse(key: string): number {
  return useSyncExternalStore(
    subscribe,
    () => pulseCount(key),
    () => 0,
  );
}
