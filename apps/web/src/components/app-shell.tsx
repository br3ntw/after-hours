"use client";

import clsx from "clsx";
import { BarChart3, Bell, LayoutDashboard, ListTree, LogOut, Map, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CommandPalette } from "@/components/command-palette";
import { DemoNotice } from "@/components/demo-notice";
import { SimControls } from "@/components/ops/sim-controls";
import { Toaster } from "@/components/ui/toaster";
import { useAuth } from "@/lib/auth/auth-provider";
import { useOverview } from "@/lib/queries";
import { useConnection } from "@/lib/realtime/realtime-provider";

const NAV = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/map", label: "Park Map", icon: Map },
  { href: "/attractions", label: "Attractions", icon: ListTree },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export const ROLE_LABEL = {
  admin: "Administrator",
  ops_manager: "Operations Manager",
  technician: "Maintenance Technician",
  analyst: "Read-Only Analyst",
} as const;

function LiveIndicator() {
  const state = useConnection();
  const meta = {
    live: { label: "Live", dot: "bg-ok shadow-[0_0_8px_var(--color-ok)]" },
    connecting: { label: "Connecting", dot: "bg-warn" },
    reconnecting: { label: "Reconnecting", dot: "bg-warn animate-pulse" },
    offline: { label: "Offline · retrying", dot: "bg-crit" },
  }[state];
  return (
    <span
      role="status"
      className="flex items-center gap-1.5 text-xs text-ink-muted"
      title="Real-time event stream"
    >
      <span aria-hidden className={clsx("size-2 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

/** Original logo mark: the Lanternfall beacon over the lagoon. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <linearGradient id="lm-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb84d" />
          <stop offset="1" stopColor="#ff6b4a" />
        </linearGradient>
        <linearGradient id="lm-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38d9ff" />
          <stop offset="1" stopColor="#367bff" />
        </linearGradient>
      </defs>
      <path d="M17 31 L18.5 12 L21.5 12 L23 31 Z" fill="url(#lm-b)" />
      <path d="M16.5 12 L20 5 L23.5 12 Z" fill="url(#lm-a)" />
      <circle cx="20" cy="15.5" r="2.2" fill="#fff" />
      <path d="M20 15.5 L35 10 L35 19 Z" fill="#ffd79a" opacity="0.55" />
      <path
        d="M5 33 Q 12.5 29 20 33 T 35 33"
        stroke="url(#lm-b)"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ParkStatusCard({ running, sim }: { running: boolean; sim: string | null }) {
  return (
    <div className="mx-3 mb-3 hidden rounded-xl border border-white/8 bg-surface-raised/60 p-3 lg:block">
      <p className="text-xs font-medium text-ink-muted">Park Status</p>
      <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold">
        <span
          aria-hidden
          className={clsx("grid size-5 place-items-center rounded-full", running ? "bg-ok/20" : "bg-warn/20")}
        >
          <span
            className={clsx(
              "size-2 rounded-full",
              running ? "bg-ok shadow-[0_0_8px_var(--color-ok)]" : "bg-warn",
            )}
          />
        </span>
        <span className={running ? "text-ok" : "text-warn"}>{running ? "Open" : "Paused"}</span>
      </p>
      <p className="mt-1 text-xs text-ink-muted">Today · 9:00 AM – 10:00 PM{sim ? ` · ${sim}` : ""}</p>
    </div>
  );
}

const parkClock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
const parkDate = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, logout } = useAuth();
  const { data: overview } = useOverview();
  const user = state.status === "authenticated" ? state.user : null;
  const openIncidents = overview ? Object.values(overview.open_incidents).reduce((a, b) => a + b, 0) : 0;
  const simTime = overview ? new Date(overview.sim.sim_time) : null;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary-fill focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <aside className="glass z-30 shrink-0 lg:sticky lg:top-3 lg:m-3 lg:flex lg:h-[calc(100vh-1.5rem)] lg:w-60 lg:flex-col lg:rounded-2xl">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-5">
          <LogoMark className="size-10" />
          <div>
            <p className="text-[17px] leading-tight font-semibold tracking-tight">After Hours</p>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-ink-muted">OPERATIONS</p>
          </div>
        </div>
        <nav aria-label="Primary" className="px-3 pb-3 lg:flex-1">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm whitespace-nowrap",
                      "transition-[background-color,color,box-shadow] duration-(--duration-fast) ease-(--ease-out)",
                      active
                        ? "bg-gradient-to-r from-primary-fill to-primary text-white shadow-[0_8px_20px_-10px_var(--color-primary)]"
                        : "text-ink-muted hover:bg-white/5 hover:text-ink",
                    )}
                  >
                    <Icon
                      aria-hidden
                      className={clsx(
                        "size-[18px]",
                        !active &&
                          "transition-transform duration-(--duration-fast) group-hover:translate-x-0.5",
                      )}
                    />
                    {label}
                    {href === "/maintenance" && openIncidents > 0 && (
                      <span
                        className="tnum ml-auto grid min-w-5 place-items-center rounded-full bg-crit px-1.5 text-[11px] font-semibold text-canvas"
                        aria-label={`${openIncidents} open`}
                      >
                        {openIncidents}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <ParkStatusCard
          running={overview?.sim.running ?? true}
          sim={simTime ? parkClock.format(simTime) : null}
        />
        {user && (
          <div className="mx-3 mb-3 hidden rounded-xl border border-white/8 bg-surface-raised/60 p-2.5 lg:block">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-primary to-purple text-xs font-semibold text-white"
              >
                {user.full_name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.full_name}</p>
                <p className="truncate text-[11px] text-ink-muted">{ROLE_LABEL[user.role]}</p>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                aria-label="Sign out"
                title="Sign out"
                className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-white/5 hover:text-ink"
              >
                <LogOut aria-hidden className="size-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="px-4 pt-3 lg:px-3 empty:hidden">
          <DemoNotice />
        </div>
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 pt-3 pb-2 lg:px-3">
          <div className="glass flex w-full items-center gap-3 rounded-2xl px-3 py-2">
            <CommandPalette />
            <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-4">
              <span
                className="hidden items-center gap-1.5 rounded-full border border-purple/40 bg-purple/10 px-2.5 py-1 text-[11px] font-medium text-purple-ink xl:inline-flex"
                title="Every guest, queue, wait time and incident on screen is generated by the AFTER HOURS simulation. Lanternfall Park is fictional."
              >
                Simulated · fictional park
              </span>
              {simTime && (
                <div className="hidden text-right leading-tight md:block">
                  <p className="text-[11px] text-ink-muted">{parkDate.format(simTime)}</p>
                  <p className="tnum text-sm font-semibold">{parkClock.format(simTime)}</p>
                </div>
              )}
              <LiveIndicator />
              <SimControls />
              <Link
                href="/maintenance"
                aria-label={`Open work orders: ${openIncidents}`}
                className="relative grid size-9 place-items-center rounded-full bg-white/5 text-ink-muted transition-colors hover:text-ink"
              >
                <Bell aria-hidden className="size-[18px]" />
                {openIncidents > 0 && (
                  <span className="tnum absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-crit px-1 text-[10px] font-semibold text-canvas">
                    {openIncidents}
                  </span>
                )}
              </Link>
              {user && (
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-lg p-2 text-ink-muted hover:text-ink lg:hidden"
                  aria-label="Sign out"
                >
                  <LogOut aria-hidden className="size-4" />
                </button>
              )}
            </div>
          </div>
        </header>
        <main id="main" className="flex-1 px-4 pt-3 pb-6 lg:px-3 lg:pr-4">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
