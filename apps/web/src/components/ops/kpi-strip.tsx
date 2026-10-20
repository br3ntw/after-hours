"use client";

import clsx from "clsx";
import { ShieldAlert, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";

import type { Overview } from "@/lib/api/types";
import { formatInt } from "@/lib/format";
import { usePulse } from "@/lib/realtime/pulse-store";

/**
 * The four headline cards from the reference mockup. Each visual plots real simulation
 * values: the operating ratio, the recent average-wait trend, guests vs. capacity, and
 * open work orders.
 */
export function KpiStrip({ data }: { data: Overview | undefined }) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[118px] rounded-2xl" />
        ))}
      </div>
    );
  }
  const incidents = Object.values(data.open_incidents).reduce((a, b) => a + b, 0);
  const major = (data.open_incidents.sev1 ?? 0) + (data.open_incidents.sev2 ?? 0);
  const capacity = data.guests_in_park / data.park_capacity;
  const waits = data.trend.map((t) => t.avg_wait);
  const before = waits.length > 12 ? waits[waits.length - 13] : undefined;
  const delta = before ? ((data.avg_wait_minutes - before) / Math.max(1, before)) * 100 : null;
  const up = data.attractions_up / Math.max(1, data.attractions_total);

  return (
    <section aria-label="Park summary (simulated)" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <Card pulseKey="kpi:attractions" title="Attractions">
        <div>
          <Value>
            {data.attractions_up}
            <span className="text-ink-muted"> / {data.attractions_total}</span>
          </Value>
          <Sub>Operational</Sub>
        </div>
        <Ring value={up} />
      </Card>

      <Card title="Avg. Wait Time">
        <div>
          <Value>{Math.round(data.avg_wait_minutes)} min</Value>
          <Sub>
            {delta === null ? (
              "across running rides"
            ) : (
              <span className={clsx("inline-flex items-center gap-1", delta > 0 ? "text-warn" : "text-ok")}>
                {delta > 0 ? (
                  <TrendingUp aria-label="up" className="size-3.5" />
                ) : (
                  <TrendingDown aria-label="down" className="size-3.5" />
                )}
                {Math.abs(delta).toFixed(0)}%
              </span>
            )}
          </Sub>
        </div>
        <Bars values={waits.slice(-12)} />
      </Card>

      <Card title="Park Capacity">
        <div>
          <Value>{Math.round(capacity * 100)}%</Value>
          <Sub>
            {formatInt(data.guests_in_park)} / {formatInt(data.park_capacity)}
          </Sub>
        </div>
        <Gauge value={capacity} />
      </Card>

      <Card pulseKey="kpi:incidents" title="Open Incidents">
        <div>
          <Value>{incidents}</Value>
          <Sub>{incidents === 0 ? "All clear" : `${incidents - major} minor · ${major} major`}</Sub>
        </div>
        <AlertBadge active={incidents > 0} major={major > 0} />
      </Card>
    </section>
  );
}

function Card({
  title,
  children,
  pulseKey,
}: {
  title: string;
  children: React.ReactNode;
  pulseKey?: string;
}) {
  const pulse = usePulse(pulseKey ?? "none");
  return (
    <div className="glass relative overflow-hidden rounded-2xl px-4 py-4 sm:px-5">
      {pulseKey && pulse > 0 && <span key={pulse} aria-hidden className="absolute inset-0 animate-flash" />}
      <p className="relative text-[13px] text-ink-muted">{title}</p>
      <div className="relative mt-1 flex items-center justify-between gap-3 [&>svg]:hidden sm:[&>svg]:block [&>span]:hidden sm:[&>span]:grid">
        {children}
      </div>
    </div>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return (
    <p className="tnum text-[24px] leading-tight font-semibold tracking-tight whitespace-nowrap text-ink sm:text-[28px]">
      {children}
    </p>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 truncate text-[13px] text-ink-muted">{children}</p>;
}

function Ring({ value }: { value: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="kpi-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5ef0b4" />
          <stop offset="1" stopColor="#1fae78" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="url(#kpi-ring)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`}
        transform="rotate(-90 32 32)"
        style={{ filter: "drop-shadow(0 0 6px rgb(53 212 154 / 0.5))" }}
        className="transition-[stroke-dasharray] duration-(--duration-slow) ease-(--ease-out)"
      />
      <text x="32" y="36" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-ink)">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

function Bars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, max);
  const span = Math.max(1, max - min);
  return (
    <svg width="76" height="48" viewBox="0 0 76 48" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="kpi-bars" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7aa8ff" />
          <stop offset="1" stopColor="#3b5bdb" />
        </linearGradient>
      </defs>
      {values.map((v, i) => {
        const h = 8 + ((v - min) / span) * 38;
        return (
          <rect
            key={i}
            x={i * 6.3}
            y={48 - h}
            width="4"
            height={h}
            rx="2"
            fill="url(#kpi-bars)"
            opacity={0.45 + (0.55 * (i + 1)) / values.length}
          />
        );
      })}
    </svg>
  );
}

function Gauge({ value }: { value: number }) {
  const v = Math.min(1, Math.max(0, value));
  const a = Math.PI * (1 - v);
  const x = 34 + 26 * Math.cos(a);
  const y = 38 - 26 * Math.sin(a);
  return (
    <svg width="68" height="48" viewBox="0 0 68 48" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="kpi-gauge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#367bff" />
          <stop offset="1" stopColor="#9b6dff" />
        </linearGradient>
      </defs>
      <path
        d="M8 38 A 26 26 0 0 1 60 38"
        fill="none"
        stroke="rgb(255 255 255 / 0.08)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d={`M8 38 A 26 26 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`}
        fill="none"
        stroke="url(#kpi-gauge)"
        strokeWidth="7"
        strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 6px rgb(155 109 255 / 0.5))" }}
      />
    </svg>
  );
}

function AlertBadge({ active, major }: { active: boolean; major: boolean }) {
  const Icon = active ? ShieldAlert : ShieldCheck;
  return (
    <span
      aria-hidden
      className={clsx(
        "grid size-12 shrink-0 place-items-center rounded-full",
        active
          ? major
            ? "bg-crit/20 text-crit shadow-[0_0_24px_-2px_rgb(255_89_100/0.6)]"
            : "bg-warn/20 text-warn shadow-[0_0_24px_-4px_rgb(255_184_77/0.5)]"
          : "bg-ok/15 text-ok",
      )}
    >
      <Icon className="size-6" />
    </span>
  );
}
