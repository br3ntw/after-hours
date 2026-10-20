"use client";

import clsx from "clsx";
import { Maximize2, Minus, Plus, Wrench } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { STATUS_META } from "@/components/status-badge";
import type { Attraction } from "@/lib/api/types";
import { RIDE_TYPE } from "@/lib/ride-type";
import { usePulse } from "@/lib/realtime/pulse-store";

import { toView, VIEW_H, VIEW_W } from "./geometry";
import { ParkArt } from "./park-art";

const MIN_K = 1;
const MAX_K = 4;

interface View {
  k: number;
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keep the map covering its frame: no panning past the edges. */
function clampView(v: View, w: number, h: number): View {
  const k = clamp(v.k, MIN_K, MAX_K);
  return { k, x: clamp(v.x, w * (1 - k), 0), y: clamp(v.y, h * (1 - k), 0) };
}

function zoomAt(v: View, factor: number, px: number, py: number, w: number, h: number): View {
  const k = clamp(v.k * factor, MIN_K, MAX_K);
  const ratio = k / v.k;
  return clampView({ k, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio }, w, h);
}

export interface ParkMapProps {
  attractions: Attraction[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
  /** Slugs to show; others are hidden (filtering). */
  visible?: ReadonlySet<string>;
  /** Slugs with open maintenance tickets. */
  alerts?: ReadonlySet<string>;
  showCrowd?: boolean;
  className?: string;
  children?: React.ReactNode; // overlays (filters, legend, detail panel)
}

export function ParkMap({
  attractions,
  selected,
  onSelect,
  visible,
  alerts,
  showCrowd = false,
  className,
  children,
}: ParkMapProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [frameWidth, setFrameWidth] = useState(900);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPinch = useRef<number | null>(null);
  const dragged = useRef(false);

  const size = () => {
    const r = frame.current?.getBoundingClientRect();
    return { w: r?.width ?? 1, h: r?.height ?? 1, left: r?.left ?? 0, top: r?.top ?? 0 };
  };

  const zoomBy = useCallback((factor: number) => {
    const { w, h } = size();
    setView((v) => zoomAt(v, factor, w / 2, h / 2, w, h));
  }, []);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setFrameWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { w, h, left, top } = size();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView((v) => zoomAt(v, factor, e.clientX - left, e.clientY - top, w, h));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // markers handle their own clicks
    frame.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const { w, h, left, top } = size();
    if (pointers.current.size === 2) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch.current) {
        const cx = (a.x + b.x) / 2 - left;
        const cy = (a.y + b.y) / 2 - top;
        setView((v) => zoomAt(v, dist / (lastPinch.current ?? dist), cx, cy, w, h));
      }
      lastPinch.current = dist;
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragged.current = true;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }, w, h));
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) lastPinch.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== frame.current) return;
    const { w, h } = size();
    const step = 60;
    const pan = (dx: number, dy: number) =>
      setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }, w, h));
    const handled: Record<string, () => void> = {
      "+": () => zoomBy(1.3),
      "=": () => zoomBy(1.3),
      "-": () => zoomBy(1 / 1.3),
      "0": () => setView({ k: 1, x: 0, y: 0 }),
      ArrowLeft: () => pan(step, 0),
      ArrowRight: () => pan(-step, 0),
      ArrowUp: () => pan(0, step),
      ArrowDown: () => pan(0, -step),
      Escape: () => onSelect(null),
    };
    const fn = handled[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  // Markers grow a little with zoom (much less than the map) and shrink on narrow maps,
  // so they stay legible without carpeting a phone-sized park.
  const markerScale = (1 / Math.pow(view.k, 0.75)) * clamp(frameWidth / 900, 0.9, 1);
  // Ride names under the wait only where there's room for them.
  const compactMarkers = frameWidth < 900;
  // Phone-sized maps show icon pins only; the wait appears on hover, focus, or selection.
  const tinyMarkers = frameWidth < 600;
  const shown = visible ? attractions.filter((a) => visible.has(a.slug)) : attractions;
  const spots = useMemo(() => attractions.map((a) => toView(a.map_x, a.map_y)), [attractions]);

  return (
    <div className={clsx("relative overflow-hidden rounded-2xl border border-line bg-canvas", className)}>
      <div
        ref={frame}
        role="application"
        aria-roledescription="interactive map"
        aria-label="Lanternfall Park map. Arrow keys pan, plus and minus zoom, 0 resets. Tab to reach attractions."
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onClick={(e) => {
          // A click on open map (not a drag, not a marker) clears the selection.
          if (!dragged.current && !(e.target as HTMLElement).closest("button")) onSelect(null);
        }}
        className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing focus-visible:outline-offset-[-2px]"
      >
        <div
          className="absolute inset-0 origin-top-left will-change-transform"
          style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.k})` }}
        >
          <ParkArt
            highlightLand={attractions.find((a) => a.slug === selected)?.land.slug ?? null}
            spots={spots}
          />
          {showCrowd && <CrowdLayer attractions={shown} />}
          <ul aria-label="Attractions on the map" className="absolute inset-0">
            {shown.map((a) => (
              <MapMarker
                key={a.slug}
                attraction={a}
                selected={a.slug === selected}
                alert={alerts?.has(a.slug) ?? false}
                scale={markerScale}
                compact={compactMarkers}
                tiny={tinyMarkers}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0">{children}</div>

      <div className="glass absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-xl">
        <MapButton label="Zoom in" onClick={() => zoomBy(1.4)}>
          <Plus aria-hidden className="size-4" />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>
          <Minus aria-hidden className="size-4" />
        </MapButton>
        <MapButton label="Reset view" onClick={() => setView({ k: 1, x: 0, y: 0 })}>
          <Maximize2 aria-hidden className="size-3.5" />
        </MapButton>
      </div>
    </div>
  );
}

function MapButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-9 place-items-center text-ink-muted transition-colors duration-(--duration-fast) hover:bg-surface-hover hover:text-ink"
    >
      {children}
    </button>
  );
}

const MapMarker = memo(function MapMarker({
  attraction: a,
  selected,
  alert,
  scale,
  compact,
  tiny,
  onSelect,
}: {
  attraction: Attraction;
  selected: boolean;
  alert: boolean;
  scale: number;
  compact: boolean;
  tiny: boolean;
  onSelect: (slug: string) => void;
}) {
  const pulseKey = usePulse(`attraction:${a.slug}`);
  const meta = STATUS_META[a.status];
  const type = RIDE_TYPE[a.type];
  const running = a.status === "operating" || a.status === "delayed";
  const stopped = !running;
  const wait = a.live?.wait_minutes;
  const label = [
    a.name,
    meta.label,
    running && wait !== null && wait !== undefined ? `${wait} minute wait (simulated)` : null,
    alert ? "open maintenance ticket" : null,
  ]
    .filter(Boolean)
    .join(", ");
  const [x, y] = toView(a.map_x, a.map_y);

  return (
    <li
      className="absolute"
      style={{
        left: `${(x / VIEW_W) * 100}%`,
        top: `${(y / VIEW_H) * 100}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        zIndex: selected ? 3 : alert || !running ? 2 : 1,
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={() => onSelect(a.slug)}
        className={clsx(
          "group relative flex items-center gap-1.5 rounded-full border p-1 text-left leading-none",
          tiny && !selected ? "hover:pr-3 focus-visible:pr-3" : "pr-3",
          "shadow-[0_8px_18px_-8px_rgb(0_0_0/0.9)] backdrop-blur-md transition-[transform,border-color,background-color] duration-(--duration-base) ease-(--ease-out) hover:-translate-y-0.5",
          selected
            ? "border-cyan bg-surface-raised/95 ring-2 ring-cyan/40"
            : stopped
              ? "border-crit/50 bg-[color-mix(in_oklab,var(--color-crit)_14%,var(--color-surface))]/90"
              : "border-white/12 bg-surface/85 hover:border-white/30",
        )}
      >
        {pulseKey > 0 && (
          <span
            key={pulseKey}
            aria-hidden
            className={clsx(
              "absolute inset-0 animate-pulse-ring rounded-full border-2 border-current",
              meta.text,
            )}
          />
        )}
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]"
          style={{
            background: stopped
              ? "linear-gradient(135deg, #ff7a84, #c9303b)"
              : `linear-gradient(135deg, ${type.from}, ${type.to})`,
          }}
        >
          {stopped ? <meta.icon className="size-3.5" /> : <type.icon className="size-3.5" />}
        </span>
        <span
          aria-hidden
          className={clsx(
            "flex-col gap-0.5",
            tiny && !selected ? "hidden group-hover:flex group-focus-visible:flex" : "flex",
          )}
        >
          <span className={clsx("tnum text-[13px] font-semibold", stopped ? meta.text : "text-ink")}>
            {running ? `${wait ?? 0} min` : meta.label === "Refurbishment" ? "Refurb" : meta.label}
            {a.status === "delayed" && <span className="ml-1 text-[10px] font-medium text-warn">hold</span>}
          </span>
          {/* Compact maps keep pins small and show the name on hover, focus, or selection. */}
          <span
            className={clsx(
              "max-w-[118px] truncate text-[10px] text-ink-muted",
              compact && !selected && "hidden group-hover:block group-focus-visible:block",
            )}
          >
            {a.name}
          </span>
        </span>
        {alert && (
          <span
            aria-hidden
            className="absolute -top-1 left-5 grid size-4 place-items-center rounded-full bg-warn text-canvas ring-2 ring-canvas"
          >
            <Wrench className="size-2.5" />
          </span>
        )}
      </button>
    </li>
  );
});

/** Simulated queue load: one outlined disc per attraction, area proportional to its queue. */
function CrowdLayer({ attractions }: { attractions: Attraction[] }) {
  const max = useMemo(() => Math.max(1, ...attractions.map((a) => a.live?.queue_length ?? 0)), [attractions]);
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden
    >
      {attractions.map((a) => {
        const q = a.live?.queue_length ?? 0;
        if (q <= 0) return null;
        const [x, y] = toView(a.map_x, a.map_y);
        const r = 18 + 70 * Math.sqrt(q / max);
        return (
          <circle
            key={a.slug}
            cx={x}
            cy={y}
            r={r}
            fill="var(--color-warn)"
            fillOpacity={0.12}
            stroke="var(--color-warn)"
            strokeOpacity={0.45}
            strokeWidth={1}
            className="transition-[r] duration-700"
          />
        );
      })}
    </svg>
  );
}
