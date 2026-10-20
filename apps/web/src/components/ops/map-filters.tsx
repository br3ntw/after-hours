"use client";

import clsx from "clsx";
import { Flame } from "lucide-react";

import { STATUS_META } from "@/components/status-badge";
import type { AttractionStatus, AttractionType } from "@/lib/api/types";

export const TYPE_LABEL: Record<AttractionType, string> = {
  coaster: "Coasters",
  dark_ride: "Dark rides",
  water: "Water",
  flat: "Flat rides",
  show: "Shows",
  family: "Family",
};

export interface MapFilterState {
  types: Set<AttractionType>;
  statuses: Set<AttractionStatus>;
  crowd: boolean;
}

export const emptyFilters = (): MapFilterState => ({ types: new Set(), statuses: new Set(), crowd: false });

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

const chip = (on: boolean) =>
  clsx(
    "pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap",
    "transition-[background-color,border-color,color] duration-(--duration-fast) ease-(--ease-out)",
    on
      ? "border-primary bg-primary-fill text-white shadow-[0_6px_16px_-8px_var(--color-primary)]"
      : "border-white/8 bg-white/[0.04] text-ink-muted hover:border-white/20 hover:text-ink",
  );

export function MapFilters({
  value,
  onChange,
  showStatus = true,
  bare = false,
}: {
  value: MapFilterState;
  onChange: (v: MapFilterState) => void;
  showStatus?: boolean;
  /** Without its own glass container (when it sits in a panel header). */
  bare?: boolean;
}) {
  return (
    <div
      className={clsx(
        "pointer-events-auto flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none]",
        bare ? "" : "glass rounded-2xl p-1.5 sm:flex-wrap",
      )}
      role="group"
      aria-label="Map filters"
    >
      <button
        type="button"
        aria-pressed={value.types.size === 0}
        className={chip(value.types.size === 0)}
        onClick={() => onChange({ ...value, types: new Set() })}
      >
        All
      </button>
      {(Object.keys(TYPE_LABEL) as AttractionType[]).map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={value.types.has(t)}
          className={chip(value.types.has(t))}
          onClick={() => onChange({ ...value, types: toggle(value.types, t) })}
        >
          {TYPE_LABEL[t]}
        </button>
      ))}
      {showStatus && <span aria-hidden className="mx-1 h-4 w-px bg-line-strong" />}
      {showStatus &&
        (["down", "delayed", "closed"] as AttractionStatus[]).map((s) => {
          const meta = STATUS_META[s];
          return (
            <button
              key={s}
              type="button"
              aria-pressed={value.statuses.has(s)}
              className={chip(value.statuses.has(s))}
              onClick={() => onChange({ ...value, statuses: toggle(value.statuses, s) })}
            >
              <meta.icon aria-hidden className={clsx("size-3.5", meta.text)} />
              {meta.label}
            </button>
          );
        })}
      <span aria-hidden className="mx-1 h-4 w-px bg-line-strong" />
      <button
        type="button"
        aria-pressed={value.crowd}
        className={chip(value.crowd)}
        onClick={() => onChange({ ...value, crowd: !value.crowd })}
      >
        <Flame aria-hidden className="size-3.5 text-warn" />
        Crowd density
      </button>
    </div>
  );
}
