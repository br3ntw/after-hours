"use client";

import clsx from "clsx";
import { ArrowLeft, Power, Wrench } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useId, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { RideArt } from "@/components/ops/ride-art";
import { StatusControl } from "@/components/ops/status-control";
import { TicketForm } from "@/components/ops/ticket-form";
import { STATUS_META, StatusBadge } from "@/components/status-badge";
import { SeverityBadge, TicketStateBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/client";
import type { Attraction, MetricPoint } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  formatDuration,
  formatInt,
  formatSimClock,
  formatSimHour,
  formatWait,
  formatWallDateTime,
  formatRelative,
} from "@/lib/format";
import {
  useAttractions,
  useChangeStatus,
  useConfigure,
  useMetrics,
  useStatusHistory,
  useTickets,
} from "@/lib/queries";
import { usePulse } from "@/lib/realtime/pulse-store";
import { toast } from "@/lib/realtime/toast-store";
import { RIDE_TYPE } from "@/lib/ride-type";

export function AttractionDetail() {
  const { slug } = useParams<{ slug: string }>();
  // Read from the live list so WebSocket ticks update this page with no extra fetches.
  const { data: attractions, isPending } = useAttractions();
  const a = attractions?.find((x) => x.slug === slug);

  if (isPending) return <div className="skeleton mx-auto h-64 max-w-[1400px] rounded-2xl" />;
  if (!a)
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">Attraction not found</h1>
        <p className="mt-2 text-sm text-ink-muted">
          No attraction called “{slug}” exists at Lanternfall Park.
        </p>
        <Link href="/attractions" className="mt-4 inline-block text-sm text-cyan">
          Back to attractions
        </Link>
      </div>
    );
  return <Detail a={a} />;
}

type Tab = "overview" | "live" | "maintenance" | "history";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "live", label: "Live Data" },
  { id: "maintenance", label: "Maintenance" },
  { id: "history", label: "History" },
];

function Detail({ a }: { a: Attraction }) {
  const { can } = useAuth();
  const { data: metrics } = useMetrics(a.slug);
  const { data: history } = useStatusHistory(a.slug);
  const { data: tickets } = useTickets();
  const reopen = useChangeStatus(a.slug);
  const [reporting, setReporting] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const uid = useId();
  const pulse = usePulse(`attraction:${a.slug}`);
  const running = a.status === "operating" || a.status === "delayed";
  const mine = (tickets ?? []).filter((t) => t.attraction.slug === a.slug);
  const active = mine.filter((t) => t.state !== "resolved" && t.state !== "closed");
  const type = RIDE_TYPE[a.type];
  const current = history?.find((h) => h.ended_at === null);

  // Throughput from the last simulated hour of samples (riders_served is per sample).
  const recent = (metrics ?? []).slice(-60);
  const spanMin =
    recent.length > 1
      ? (new Date(recent.at(-1)!.sim_time).getTime() - new Date(recent[0]!.sim_time).getTime()) / 60000
      : 0;
  const ridersPerHour =
    spanMin > 0 ? (recent.slice(1).reduce((s, m) => s + m.riders_served, 0) / spanMin) * 60 : 0;
  const utilization = a.hourly_capacity ? ridersPerHour / a.hourly_capacity : 0;
  const waits = (metrics ?? []).slice(-24).map((m) => m.wait_minutes ?? 0);
  const served = (metrics ?? [])
    .slice(-41)
    .map((m, i, all) => {
      const prev = all[i - 1];
      const min = prev ? (new Date(m.sim_time).getTime() - new Date(prev.sim_time).getTime()) / 60000 : 0;
      return min > 0 ? m.riders_served / min : null;
    })
    .filter((v): v is number => v !== null);
  const avgWait = waits.length ? waits.reduce((s, w) => s + w, 0) / waits.length : 0;

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = TABS[(next + TABS.length) % TABS.length]!;
    setTab(t.id);
    document.getElementById(`${uid}-tab-${t.id}`)?.focus();
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <Link
        href="/attractions"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" /> Attractions
      </Link>

      <header className="glass relative overflow-hidden rounded-2xl">
        {/* The scene keeps its 2:1 shape on the right and fades into the banner, so wide
            screens never crop the ride itself. */}
        <div className="relative h-[240px] overflow-hidden bg-canvas sm:h-[360px]">
          <div className="absolute inset-y-0 right-0 aspect-[2/1] min-w-full sm:min-w-0 sm:[mask-image:linear-gradient(to_right,transparent,black_30%)]">
            <RideArt
              slug={a.slug}
              land={a.land.slug}
              type={a.type}
              anchor="bottom"
              className="absolute inset-0 size-full"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/30 to-transparent" />
        </div>
        <div className="relative -mt-24 flex flex-wrap items-end justify-between gap-4 px-5 pb-5 sm:-mt-28 sm:px-7 sm:pb-6">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-sm text-ink-muted">
              <span
                aria-hidden
                className="grid size-7 place-items-center rounded-full text-white shadow-lg"
                style={{ background: `linear-gradient(135deg, ${type.from}, ${type.to})` }}
              >
                <type.icon className="size-3.5" />
              </span>
              {type.label} · {a.land.name}
            </p>
            <h1 className="mt-2 text-[30px] leading-tight font-semibold tracking-tight text-white sm:text-[38px]">
              {a.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span key={pulse} className={pulse ? "animate-enter" : undefined}>
                <StatusBadge status={a.status} />
              </span>
              {active.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warn/16 px-2.5 py-0.5 text-xs font-medium text-warn">
                  <Wrench aria-hidden className="size-3.5" /> Maintenance · {active.length} open
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can("tickets:create") && (
              <Button variant={running ? "primary" : "secondary"} onClick={() => setReporting(true)}>
                <Wrench aria-hidden className="size-4" /> New work order
              </Button>
            )}
            {!running && can("attractions:change_status") && (
              <Button
                variant="primary"
                disabled={reopen.isPending}
                onClick={() =>
                  reopen.mutate(
                    { status: "operating" },
                    {
                      onSuccess: () => toast({ tone: "success", title: `${a.name} is open` }),
                      onError: (err) =>
                        toast({
                          tone: "critical",
                          title: "Could not open the attraction",
                          body: err instanceof ApiError ? err.message : undefined,
                        }),
                    },
                  )
                }
              >
                <Power aria-hidden className="size-4" /> Open attraction
              </Button>
            )}
          </div>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Attraction sections"
        onKeyDown={onTabKey}
        className="flex gap-1 overflow-x-auto border-b border-white/8"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`${uid}-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`${uid}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={clsx(
              "relative shrink-0 px-4 py-2.5 text-sm font-medium transition-colors duration-(--duration-fast)",
              tab === t.id ? "text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.id === "maintenance" && active.length > 0 && (
              <span className="tnum ml-1.5 rounded-full bg-warn/20 px-1.5 text-[11px] text-warn">
                {active.length}
              </span>
            )}
            {tab === t.id && (
              <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      <div
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${tab}`}
        key={tab}
        className="animate-enter space-y-4"
      >
        {tab === "overview" && (
          <>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Current status">
                <dd className="mt-1">
                  <StatusBadge status={a.status} />
                </dd>
                <dd className="mt-2 truncate text-[13px] text-ink-muted">
                  {current
                    ? `Changed ${formatRelative(current.started_at)}${current.reason ? ` · ${current.reason}` : ""}`
                    : " "}
                </dd>
              </StatCard>
              <StatCard label={running ? "Posted wait" : "Estimated return"}>
                <dd className="tnum mt-1 text-[28px] leading-tight font-semibold">
                  {running
                    ? formatWait(a.live?.wait_minutes)
                    : active.length
                      ? "After repair"
                      : "When reopened"}
                </dd>
                <dd className="mt-1 flex items-end justify-between gap-2 text-[13px] text-ink-muted">
                  <span>Avg {Math.round(avgWait)} min recently</span>
                  <MiniBars values={waits} />
                </dd>
              </StatCard>
              <StatCard label="Throughput (last sim hour)">
                <dd className="tnum mt-1 text-[28px] leading-tight font-semibold">
                  {formatInt(ridersPerHour)}/h
                </dd>
                <dd className="mt-1 flex items-end justify-between gap-2 text-[13px] text-ink-muted">
                  <span>{formatInt(a.live?.queue_length ?? 0)} in line</span>
                  <Sparkline values={served} />
                </dd>
              </StatCard>
              <StatCard label="Capacity utilization">
                <dd className="tnum mt-1 text-[28px] leading-tight font-semibold">
                  {Math.round(utilization * 100)}%
                </dd>
                <dd className="mt-2">
                  <div className="h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-purple transition-[width] duration-(--duration-slow)"
                      style={{ width: `${Math.min(100, utilization * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[13px] text-ink-muted">
                    of {formatInt(a.hourly_capacity)}/h design capacity
                  </p>
                </dd>
              </StatCard>
            </dl>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0 space-y-4">
                <section className="glass rounded-2xl p-5" aria-labelledby={`${uid}-about`}>
                  <h2 id={`${uid}-about`} className="text-[15px] font-semibold">
                    About this attraction
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{a.description}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Fact label="Riders per dispatch" value={String(a.riders_per_dispatch)} />
                    <Fact label="Dispatch every" value={`${a.dispatch_interval_s}s`} />
                    <Fact label="Design capacity" value={`${formatInt(a.hourly_capacity)}/h`} />
                    <Fact label="Guests in line" value={formatInt(a.live?.queue_length ?? 0)} />
                  </dl>
                </section>
                <section className="glass rounded-2xl p-5" aria-labelledby={`${uid}-wait`}>
                  <h2 id={`${uid}-wait`} className="text-[15px] font-semibold">
                    Posted wait, simulated
                  </h2>
                  <WaitChart data={metrics} />
                </section>
              </div>
              <div className="space-y-4">
                <section className="glass rounded-2xl p-5" aria-labelledby={`${uid}-status`}>
                  <h2 id={`${uid}-status`} className="mb-3 text-[15px] font-semibold">
                    Operational status
                  </h2>
                  <StatusControl attraction={a} />
                </section>
                {/* Keyed by version: a newer server version re-initialises the form fields. */}
                {can("attractions:configure") && <ConfigureForm key={a.version} a={a} />}
              </div>
            </div>
          </>
        )}

        {tab === "live" && (
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="glass rounded-2xl p-5" aria-labelledby={`${uid}-wait2`}>
              <h2 id={`${uid}-wait2`} className="text-[15px] font-semibold">
                Posted wait, simulated
              </h2>
              <p className="text-xs text-ink-muted">
                Last {metrics?.length ?? 0} samples on the park clock. Gaps are times the ride wasn’t running.
              </p>
              <WaitChart data={metrics} />
            </section>
            <section className="glass rounded-2xl p-5" aria-labelledby={`${uid}-tp`}>
              <h2 id={`${uid}-tp`} className="text-[15px] font-semibold">
                Riders per minute, simulated
              </h2>
              <p className="text-xs text-ink-muted">Riders served ÷ minutes since the previous sample.</p>
              <ThroughputChart data={metrics} />
            </section>
          </div>
        )}

        {tab === "maintenance" && (
          <section className="glass rounded-2xl p-5" aria-labelledby={`${uid}-maint`}>
            <h2 id={`${uid}-maint`} className="mb-3 text-[15px] font-semibold">
              Work orders
            </h2>
            {mine.length === 0 ? (
              <p className="text-sm text-ink-muted">No work orders for this attraction.</p>
            ) : (
              <ul className="divide-y divide-white/6">
                {mine.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/maintenance?ticket=${t.id}`}
                      className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.04]"
                    >
                      <SeverityBadge severity={t.severity} />
                      <span className="w-20 shrink-0 font-mono text-xs text-ink-faint">{t.ref}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                      <span className="hidden truncate text-xs text-ink-muted sm:inline">
                        {t.assignee ? t.assignee.full_name : "Unassigned"}
                      </span>
                      <TicketStateBadge state={t.state} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "history" && (
          <section className="glass rounded-2xl p-5" aria-label="Status history">
            <h2 className="mb-3 text-[15px] font-semibold">Status history</h2>
            <ol className="relative space-y-4 border-l border-white/10 pl-5">
              {history?.map((h) => {
                const meta = STATUS_META[h.status];
                return (
                  <li key={h.started_at} className="relative text-sm">
                    <span
                      aria-hidden
                      className={`absolute top-0.5 -left-[31px] grid size-5 place-items-center rounded-full bg-surface ring-2 ring-surface ${meta.text}`}
                    >
                      <meta.icon className="size-4" />
                    </span>
                    <p>
                      <span className="font-medium">{meta.label}</span>{" "}
                      <span className="text-ink-muted">
                        for {formatDuration(h.started_at, h.ended_at)}
                        {h.ended_at ? "" : " (current)"}
                      </span>
                    </p>
                    <p className="text-xs text-ink-faint">
                      {formatWallDateTime(h.started_at)}
                      {h.reason ? ` · ${h.reason}` : ""}
                    </p>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>

      <Dialog
        open={reporting}
        onClose={() => setReporting(false)}
        title="Create maintenance ticket"
        description={a.name}
      >
        <TicketForm
          defaultAttraction={a.slug}
          onCreated={() => setReporting(false)}
          onCancel={() => setReporting(false)}
        />
      </Dialog>
    </div>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-3 py-2.5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="tnum mt-0.5 text-[15px] font-semibold">{value}</dd>
    </div>
  );
}

function MiniBars({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 72 / values.length;
  return (
    <svg width="72" height="32" viewBox="0 0 72 32" aria-hidden className="shrink-0">
      {values.map((v, i) => {
        const h = 3 + (v / max) * 29;
        return (
          <rect
            key={i}
            x={i * w}
            y={32 - h}
            width={Math.max(1, w - 1.2)}
            height={h}
            rx="1"
            fill="var(--color-primary)"
            opacity={0.4 + (0.6 * (i + 1)) / values.length}
          />
        );
      })}
    </svg>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map(
    (v, i) => `${((i / (values.length - 1)) * 80).toFixed(1)},${(30 - (v / max) * 26).toFixed(1)}`,
  );
  return (
    <svg width="80" height="32" viewBox="0 0 80 32" aria-hidden className="shrink-0 overflow-visible">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--color-cyan)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

const axis = {
  tick: { fill: "var(--color-ink-faint)", fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;

function chartData(data: MetricPoint[]) {
  return data.map((m) => ({
    t: new Date(m.sim_time).getTime(),
    iso: m.sim_time,
    wait: m.wait_minutes,
    served: m.riders_served,
    status: m.status,
  }));
}

function TipBox({ iso, line }: { iso: string; line: string }) {
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs">
      <p className="text-ink-muted">{formatSimClock(iso)} · simulated</p>
      <p className="tnum mt-0.5 font-mono text-sm text-ink">{line}</p>
    </div>
  );
}

function WaitChart({ data }: { data: MetricPoint[] | undefined }) {
  if (!data) return <div className="skeleton mt-3 h-52" />;
  const rows = chartData(data);
  return (
    <div className="mt-3 h-52" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" strokeOpacity={0.6} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => formatSimHour(new Date(t).toISOString())}
            minTickGap={30}
            {...axis}
          />
          <YAxis unit="m" width={46} {...axis} />
          <Tooltip
            cursor={{ stroke: "var(--color-ink-faint)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
              return p ? (
                <TipBox
                  iso={p.iso}
                  line={p.wait === null ? STATUS_META[p.status].label : `${p.wait} min wait`}
                />
              ) : null;
            }}
          />
          <Line
            type="monotone"
            dataKey="wait"
            stroke="var(--color-cyan)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ThroughputChart({ data }: { data: MetricPoint[] | undefined }) {
  if (!data) return <div className="skeleton mt-3 h-40" />;
  // Samples are not evenly spaced (5-min warm-up buckets, then one per tick at the current
  // speed), so plot a rate: riders served ÷ minutes since the previous sample.
  const rows = chartData(data.slice(-91))
    .map((r, i, all) => {
      const prev = all[i - 1];
      const minutes = prev ? (r.t - prev.t) / 60000 : 0;
      return { ...r, rate: minutes > 0 ? Math.round(r.served / minutes) : null };
    })
    .slice(1);
  return (
    <div className="mt-3 h-40" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 6, right: 8, left: 4, bottom: 0 }} barCategoryGap={1}>
          <CartesianGrid stroke="var(--color-line)" strokeOpacity={0.6} vertical={false} />
          <XAxis
            dataKey="t"
            interval={Math.max(0, Math.floor(rows.length / 6) - 1)}
            tickFormatter={(t: number) => formatSimClock(new Date(t).toISOString())}
            {...axis}
          />
          <YAxis width={46} {...axis} />
          <Tooltip
            cursor={{ fill: "var(--color-surface-hover)" }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
              return p ? <TipBox iso={p.iso} line={`${p.rate ?? 0} riders/min`} /> : null;
            }}
          />
          <Bar dataKey="rate" fill="var(--color-series-4)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ConfigureForm({ a }: { a: Attraction }) {
  const configure = useConfigure(a.slug);
  const [riders, setRiders] = useState(a.riders_per_dispatch);
  const [interval, setIntervalS] = useState(a.dispatch_interval_s);
  const [error, setError] = useState<string | null>(null);
  const derived = Math.round((riders * 3600) / Math.max(1, interval));
  const dirty = riders !== a.riders_per_dispatch || interval !== a.dispatch_interval_s;

  return (
    <section className="glass rounded-2xl p-5" aria-labelledby="cfg-h">
      <h2 id="cfg-h" className="text-[15px] font-semibold">
        Dispatch configuration
      </h2>
      <p className="text-xs text-ink-muted">Hourly capacity is derived from riders × dispatches per hour.</p>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          configure.mutate(
            { version: a.version, riders_per_dispatch: riders, dispatch_interval_s: interval },
            {
              onSuccess: (updated) =>
                toast({
                  tone: "success",
                  title: `${a.name} capacity is now ${formatInt(updated.hourly_capacity)}/h`,
                }),
              onError: (err) => {
                if (err instanceof ApiError && err.status === 409) {
                  // A toast, not inline text: the form remounts with the fresh version.
                  toast({
                    tone: "warning",
                    title: "Someone else changed this attraction",
                    body: "Their values are loaded now. Review and save again.",
                  });
                } else {
                  setError(err instanceof ApiError ? err.message : "Save failed.");
                }
              },
            },
          );
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-ink-muted">
            Riders per dispatch
            <input
              type="number"
              min={1}
              max={1000}
              value={riders}
              onChange={(e) => setRiders(Number(e.target.value))}
              className="tnum block h-9 w-full rounded-lg border border-line bg-canvas px-2.5 font-mono text-sm text-ink focus:border-primary focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-ink-muted">
            Seconds between dispatches
            <input
              type="number"
              min={5}
              max={3600}
              value={interval}
              onChange={(e) => setIntervalS(Number(e.target.value))}
              className="tnum block h-9 w-full rounded-lg border border-line bg-canvas px-2.5 font-mono text-sm text-ink focus:border-primary focus:outline-none"
            />
          </label>
        </div>
        <p className="text-xs text-ink-muted">
          Resulting capacity:{" "}
          <span className={`tnum font-mono ${derived > 5000 ? "text-crit" : "text-ink"}`}>
            {formatInt(derived)}/h
          </span>
          {derived > 5000 && " (limit 5,000/h)"}
        </p>
        {error && (
          <p role="alert" className="text-xs text-crit">
            {error}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!dirty || derived > 5000 || configure.isPending}
        >
          Save configuration
        </Button>
      </form>
    </section>
  );
}
