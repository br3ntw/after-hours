"use client";

import clsx from "clsx";
import { Clock, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { RideArt } from "@/components/ops/ride-art";
import { StatusBadge } from "@/components/status-badge";
import type { Attraction } from "@/lib/api/types";
import { formatInt } from "@/lib/format";
import { useAttractions, useOpenTickets } from "@/lib/queries";
import { usePulse } from "@/lib/realtime/pulse-store";
import { RIDE_TYPE } from "@/lib/ride-type";

type Sort = "wait" | "name" | "land";

const running = (a: Attraction) => a.status === "operating" || a.status === "delayed";

export function AttractionsList() {
  const { data } = useAttractions();
  const { data: tickets } = useOpenTickets();
  const [land, setLand] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("wait");
  const alerts = new Set((tickets ?? []).map((t) => t.attraction.slug));
  const lands = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of data ?? []) seen.set(a.land.slug, a.land.name);
    return [...seen].map(([slug, name]) => ({ slug, name })).sort((x, y) => x.name.localeCompare(y.name));
  }, [data]);

  const rows = useMemo(() => {
    const list = (data ?? []).filter((a) => !land || a.land.slug === land);
    return list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "land") return a.land.name.localeCompare(b.land.name) || a.name.localeCompare(b.name);
      const wa = running(a) ? (a.live?.wait_minutes ?? 0) : -1;
      const wb = running(b) ? (b.live?.wait_minutes ?? 0) : -1;
      return wb - wa;
    });
  }, [data, land, sort]);

  return (
    <div className="mx-auto max-w-[1680px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Attractions</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {data ? `${data.filter(running).length} of ${data.length} running` : "Loading…"} · live simulated
            waits
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Sort by
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-9 rounded-xl border border-white/10 bg-surface px-3 text-sm text-ink"
          >
            <option value="wait">Longest wait</option>
            <option value="name">Name</option>
            <option value="land">Land</option>
          </select>
        </label>
      </header>

      <div role="group" aria-label="Filter by land" className="flex flex-wrap gap-1.5">
        {[{ slug: null, name: "All lands" }, ...lands].map((l) => (
          <button
            key={l.slug ?? "all"}
            type="button"
            aria-pressed={land === l.slug}
            onClick={() => setLand(l.slug)}
            className={clsx(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-(--duration-fast)",
              land === l.slug
                ? "border-primary bg-primary-fill text-white"
                : "border-white/8 bg-white/[0.04] text-ink-muted hover:text-ink",
            )}
          >
            {l.name}
          </button>
        ))}
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {!data &&
          Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <div className="skeleton h-[280px] rounded-2xl" />
            </li>
          ))}
        {rows.map((a) => (
          <AttractionCard key={a.slug} a={a} alert={alerts.has(a.slug)} />
        ))}
      </ul>
    </div>
  );
}

function AttractionCard({ a, alert }: { a: Attraction; alert: boolean }) {
  const pulse = usePulse(`attraction:${a.slug}`);
  const type = RIDE_TYPE[a.type];
  const live = running(a);
  return (
    <li>
      <Link
        href={`/attractions/${a.slug}`}
        className="glass group relative block overflow-hidden rounded-2xl transition-[transform,border-color] duration-(--duration-base) ease-(--ease-out) hover:-translate-y-0.5 hover:border-white/20"
      >
        {pulse > 0 && <span key={pulse} aria-hidden className="absolute inset-0 z-10 animate-flash" />}
        <div className="relative aspect-[16/9] overflow-hidden">
          <RideArt
            slug={a.slug}
            land={a.land.slug}
            type={a.type}
            className={clsx(
              "absolute inset-0 size-full transition-transform duration-500 ease-(--ease-out) group-hover:scale-[1.04]",
              !live && "grayscale-[60%]",
            )}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface/90 via-transparent to-transparent" />
          <span
            aria-hidden
            className="absolute top-3 left-3 grid size-8 place-items-center rounded-full text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${type.from}, ${type.to})` }}
          >
            <type.icon className="size-4" />
          </span>
          {alert && (
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-warn px-2 py-0.5 text-[11px] font-semibold text-canvas">
              <Wrench aria-hidden className="size-3" /> Work order
            </span>
          )}
          <div className="absolute right-3 bottom-2 left-3 flex items-end justify-between gap-2">
            <StatusBadge status={a.status} size="sm" />
            {live && (
              <span className="tnum rounded-full bg-black/55 px-2.5 py-1 text-sm font-semibold text-white backdrop-blur">
                {a.live?.wait_minutes ?? 0} min
              </span>
            )}
          </div>
        </div>
        <div className="px-4 pt-3 pb-4">
          <p className="truncate text-[15px] font-semibold text-ink group-hover:text-white">{a.name}</p>
          <p className="truncate text-[13px] text-ink-muted">
            {type.label} · {a.land.name}
          </p>
          <div className="tnum mt-3 flex items-center gap-4 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <Users aria-hidden className="size-3.5" /> {formatInt(a.live?.queue_length ?? 0)} in line
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden className="size-3.5" /> {formatInt(a.hourly_capacity)}/h capacity
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
