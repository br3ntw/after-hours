"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { GuestFlow } from "@/lib/api/types";
import { formatInt, formatSimClock, formatSimHour } from "@/lib/format";

const BUCKETS = 28;

/**
 * Guests in park across today's simulated day, as gradient bars (reference mockup).
 * Samples are averaged into evenly sized buckets so bar widths stay constant as the day fills.
 */
export function GuestFlowChart({ data, height = 180 }: { data: GuestFlow | undefined; height?: number }) {
  if (!data) return <div className="skeleton rounded-xl" style={{ height }} />;
  const pts = data.points;
  const size = Math.max(1, Math.ceil(pts.length / BUCKETS));
  const bars = Array.from({ length: Math.ceil(pts.length / size) }, (_, i) => {
    const slice = pts.slice(i * size, (i + 1) * size);
    const last = slice.at(-1)!;
    return {
      t: new Date(last.sim_time).getTime(),
      iso: last.sim_time,
      guests: Math.round(slice.reduce((s, p) => s + p.guests, 0) / slice.length),
      wait: slice.reduce((s, p) => s + p.avg_wait, 0) / slice.length,
    };
  });
  const lastIdx = bars.length - 1;

  return (
    <figure className="m-0">
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
            <defs>
              <linearGradient id="gf-bar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5b8cff" />
                <stop offset="100%" stopColor="#2f4fd0" stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="gf-bar-now" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38d9ff" />
                <stop offset="100%" stopColor="#367bff" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(t: number) => formatSimHour(new Date(t).toISOString())}
              tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval={Math.max(0, Math.floor(bars.length / 6) - 1)}
            />
            <YAxis
              tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : String(v))}
              tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              cursor={{ fill: "rgb(255 255 255 / 0.04)" }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as (typeof bars)[number] | undefined) : undefined;
                if (!p) return null;
                return (
                  <div className="glass rounded-xl px-3 py-2 text-xs">
                    <p className="text-ink-muted">{formatSimClock(p.iso)} · simulated</p>
                    <p className="tnum mt-0.5 text-sm font-semibold text-ink">{formatInt(p.guests)} guests</p>
                    <p className="tnum text-ink-muted">avg wait {Math.round(p.wait)} min</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="guests" radius={[4, 4, 1, 1]} isAnimationActive={false}>
              {bars.map((_, i) => (
                <Cell key={i} fill={i === lastIdx ? "url(#gf-bar-now)" : "url(#gf-bar)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Simulated guests in park today, {bars.length} intervals.{" "}
        {bars[lastIdx]
          ? `Latest: ${formatInt(bars[lastIdx].guests)} guests at ${formatSimClock(bars[lastIdx].iso)}.`
          : ""}
      </figcaption>
    </figure>
  );
}
