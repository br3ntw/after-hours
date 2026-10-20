"use client";

import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { GuestFlowChart } from "@/components/ops/guest-flow-chart";
import { api } from "@/lib/api/client";
import type { MetricPoint } from "@/lib/api/types";
import { formatInt, formatSimClock, formatSimHour } from "@/lib/format";
import { keys, useAttractions, useGuestFlow, useReliability } from "@/lib/queries";

// Categorical slots in fixed order (validated palette; see globals.css).
const SERIES = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
];

export function AnalyticsPage() {
  const { data: rel } = useReliability();
  const { data: flow } = useGuestFlow();
  const { data: attractions } = useAttractions();

  // The four most popular attractions are the headliners whose waits we trend.
  const headliners = [...(attractions ?? [])].sort((a, b) => b.popularity - a.popularity).slice(0, 4);
  const metricQueries = useQueries({
    queries: headliners.map((a) => ({
      queryKey: keys.metrics(a.slug),
      queryFn: () => api.get<MetricPoint[]>(`/api/v1/attractions/${a.slug}/metrics?limit=240`),
      refetchInterval: 10_000,
    })),
  });

  const merged = new Map<number, Record<string, number | string | null>>();
  metricQueries.forEach((q, i) => {
    const slug = headliners[i]?.slug;
    if (!slug) return;
    for (const m of q.data ?? []) {
      const t = new Date(m.sim_time).getTime();
      const row = merged.get(t) ?? { t, iso: m.sim_time };
      row[slug] = m.wait_minutes;
      merged.set(t, row);
    }
  });
  const trendRows = [...merged.values()].sort((a, b) => (a.t as number) - (b.t as number));
  const worst = [...(rel?.attractions ?? [])].sort((a, b) => a.uptime_pct - b.uptime_pct);

  // End-of-line labels: Recharts may call a label renderer several times per render, so
  // each series' adjusted y is remembered by name and only nudged once, away from labels
  // already placed for *other* series (11px text needs ~13px of separation).
  const placed = new Map<string, number>();
  const placeLabel = (series: string, y: number) => {
    const known = placed.get(series);
    if (known !== undefined) return known;
    let at = y;
    while ([...placed.values()].some((p) => Math.abs(p - at) < 13)) at += 13;
    placed.set(series, at);
    return at;
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Reliability over the last 24 hours of wall time, and today’s simulated park day.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile k="Park uptime" v={rel ? `${rel.uptime_pct.toFixed(1)}%` : "—"} sub="mean across attractions" />
        <Tile
          k="Mean time to recovery"
          v={rel?.mttr_park_minutes != null ? `${Math.round(rel.mttr_park_minutes)} min` : "—"}
          sub={`park time · ${rel?.mttr_minutes != null ? `${Math.round(rel.mttr_minutes)} min` : "—"} wall clock`}
        />
        <Tile k="Incidents" v={rel ? String(rel.incidents) : "—"} sub={`${rel?.resolved ?? 0} resolved`} />
        <Tile k="Rides taken today" v={flow ? formatInt(flow.riders_today) : "—"} sub="simulated park day" />
      </dl>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel p-4" aria-labelledby="trend-h">
          <h2 id="trend-h" className="text-sm font-semibold">
            Headliner wait times
          </h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="Legend">
            {headliners.map((a, i) => (
              <li key={a.slug} className="flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: SERIES[i] }} />
                {a.name}
              </li>
            ))}
          </ul>
          <div className="mt-3 h-72" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendRows} margin={{ top: 6, right: 136, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" strokeOpacity={0.6} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t: number) => formatSimHour(new Date(t).toISOString())}
                  minTickGap={30}
                  tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  unit="m"
                  width={46}
                  tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ stroke: "var(--color-ink-faint)", strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    const row = active
                      ? (payload?.[0]?.payload as Record<string, number | string | null> | undefined)
                      : undefined;
                    if (!row) return null;
                    return (
                      <div className="glass rounded-lg px-3 py-2 text-xs">
                        <p className="text-ink-muted">{formatSimClock(String(row.iso))} · simulated</p>
                        {headliners.map((a, i) => (
                          <p key={a.slug} className="mt-0.5 flex items-center gap-2">
                            <span
                              aria-hidden
                              className="h-0.5 w-3 rounded-full"
                              style={{ background: SERIES[i] }}
                            />
                            <span className="flex-1 text-ink-muted">{a.name}</span>
                            <span className="tnum font-mono text-ink">
                              {row[a.slug] == null ? "—" : `${row[a.slug]} min`}
                            </span>
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                {headliners.map((a, i) => (
                  <Line
                    key={a.slug}
                    dataKey={a.slug}
                    name={a.name}
                    type="monotone"
                    stroke={SERIES[i]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                    label={(props: { x?: number | string; y?: number | string; index?: number }) =>
                      props.index === trendRows.length - 1 &&
                      props.x !== undefined &&
                      props.y !== undefined ? (
                        <text
                          x={Number(props.x) + 6}
                          y={placeLabel(a.slug, Number(props.y)) + 4}
                          fontSize={11}
                          fill="var(--color-ink-muted)"
                        >
                          {a.name}
                        </text>
                      ) : null
                    }
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Latest simulated wait per headliner</caption>
            <tbody>
              {headliners.map((a) => (
                <tr key={a.slug}>
                  <th>{a.name}</th>
                  <td>{a.live?.wait_minutes ?? "not running"} minutes</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel p-4" aria-labelledby="uptime-h">
          <h2 id="uptime-h" className="text-sm font-semibold">
            Uptime by attraction
          </h2>
          <p className="text-xs text-ink-muted">
            Least reliable first · last {rel?.window_hours ?? 24} h · bars span 90–100%
          </p>
          <ol className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1">
            {worst.map((r) => (
              <li key={r.slug}>
                <Link href={`/attractions/${r.slug}`} className="group block">
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="truncate group-hover:text-cyan">{r.name}</span>
                    <span className="tnum shrink-0 font-mono text-ink-muted">
                      {r.uptime_pct.toFixed(1)}%{r.incidents ? ` · ${r.incidents} inc` : ""}
                      {r.mttr_minutes != null ? ` · ${Math.round(r.mttr_minutes)}m MTTR` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-raised" aria-hidden>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(2, ((Math.max(90, r.uptime_pct) - 90) / 10) * 100)}%`,
                        background:
                          r.uptime_pct >= 99
                            ? "var(--color-ok)"
                            : r.uptime_pct >= 95
                              ? "var(--color-warn)"
                              : "var(--color-crit)",
                      }}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="panel px-4 pt-3 pb-2" aria-labelledby="flow-h">
        <h2 id="flow-h" className="text-sm font-semibold">
          Guests in park today
        </h2>
        <GuestFlowChart data={flow} height={220} />
      </section>
      {rel?.note && <p className="text-xs text-ink-faint">{rel.note}</p>}
    </div>
  );
}

function Tile({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <dt className="text-[13px] text-ink-muted">{k}</dt>
      <dd className="tnum mt-1 text-[28px] leading-tight font-semibold tracking-tight">{v}</dd>
      <dd className="mt-0.5 text-[13px] text-ink-muted">{sub}</dd>
    </div>
  );
}
