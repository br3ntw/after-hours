"use client";

import clsx from "clsx";
import { Activity, FlaskConical, Settings2, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { STATUS_META } from "@/components/status-badge";
import type { ActivityItem, AttractionStatus } from "@/lib/api/types";
import { usePulse } from "@/lib/realtime/pulse-store";

interface Described {
  category: string;
  icon: typeof Activity;
  tone: string;
  title: string;
  detail: string;
  href?: string;
}

const TICKET_CHANGE: Record<string, string> = {
  created: "opened",
  assigned: "assigned",
  in_progress: "work started",
  resolved: "resolved",
  closed: "closed",
};

export function describe(item: ActivityItem): Described {
  const p = item.payload as Record<string, unknown>;
  switch (item.type) {
    case "attraction.status_changed": {
      const to = p.to as AttractionStatus;
      const meta = STATUS_META[to] ?? STATUS_META.closed;
      return {
        category: "STATUS",
        icon: meta.icon,
        tone: meta.text,
        title: `${String(p.name)} · ${meta.label}`,
        detail: [p.reason, p.actor].filter(Boolean).join(" · "),
        href: `/attractions/${String(p.slug)}`,
      };
    }
    case "attraction.configured":
      return {
        category: "CONFIG",
        icon: Settings2,
        tone: "text-cyan",
        title: `${String(p.name)} capacity → ${String(p.hourly_capacity)}/h`,
        detail: String(p.actor),
        href: `/attractions/${String(p.slug)}`,
      };
    case "ticket.created":
    case "ticket.updated": {
      const attraction = p.attraction as { name: string } | undefined;
      const change = TICKET_CHANGE[String(p.change)] ?? String(p.change);
      const severity = String(p.severity).toUpperCase();
      return {
        category: "WORK ORDER",
        icon: Wrench,
        tone: p.severity === "sev1" ? "text-crit" : p.severity === "sev2" ? "text-warn" : "text-ink-muted",
        title: `${String(p.ref)} ${change}${change === "assigned" && p.assignee ? ` to ${String(p.assignee)}` : ""}`,
        detail: `${severity} · ${attraction?.name ?? ""} · ${String(p.title)}`,
        href: `/maintenance?ticket=${String(p.id)}`,
      };
    }
    case "sim.control":
      return {
        category: "SIM",
        icon: FlaskConical,
        tone: "text-purple",
        title: `Simulation ${String(p.action)}`,
        detail: String(p.actor ?? ""),
      };
    default:
      return { category: "EVENT", icon: Activity, tone: "text-ink-muted", title: item.type, detail: "" };
  }
}

export function ActivityFeed({
  items,
  className,
}: {
  items: ActivityItem[] | undefined;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  if (!items)
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-11" />
        ))}
      </div>
    );
  if (items.length === 0)
    return (
      <p className="px-4 py-6 text-center text-sm text-ink-muted">
        No activity yet. Status changes and work orders appear here as they happen.
      </p>
    );

  return (
    <ol aria-label="Live activity" className={clsx("space-y-0.5 p-1.5", className)}>
      {items.map((item) => (
        <FeedRow key={item.id} item={item} now={now} />
      ))}
    </ol>
  );
}

/** Compact elapsed time for the log column. Events carry wall time, while the console
 * header shows the park clock, so the log shows age rather than a second clock. */
export function age(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

// Circular icon chip per event, tinted by the event's tone (mockup "Live Activity").
const CHIP: Record<string, string> = {
  "text-ok": "bg-ok/15 text-ok ring-ok/30",
  "text-warn": "bg-warn/15 text-warn ring-warn/30",
  "text-crit": "bg-crit/15 text-crit ring-crit/35",
  "text-purple": "bg-purple/15 text-purple ring-purple/30",
  "text-cyan": "bg-cyan/15 text-cyan ring-cyan/30",
};

function FeedRow({ item, now }: { item: ActivityItem; now: number }) {
  const d = describe(item);
  const pulse = usePulse(`feed:${item.id}`);
  const chip = CHIP[d.tone] ?? "bg-primary/15 text-[color:var(--color-primary-ink)] ring-primary/30";
  const body = (
    <>
      {pulse > 0 && <span key={pulse} aria-hidden className="absolute inset-0 animate-flash" />}
      <span
        aria-hidden
        className={clsx("relative grid size-9 shrink-0 place-items-center rounded-full ring-1", chip)}
      >
        <d.icon className="size-4" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{d.title}</span>
        {d.detail && <span className="block truncate text-xs text-ink-muted">{d.detail}</span>}
      </span>
      <time
        dateTime={item.occurred_at}
        title={new Date(item.occurred_at).toLocaleString()}
        className="relative shrink-0 text-[11px] whitespace-nowrap text-ink-faint"
      >
        {age(item.occurred_at, now) === "now" ? "just now" : `${age(item.occurred_at, now)} ago`}
      </time>
    </>
  );
  return (
    <li className="relative">
      {d.href ? (
        <Link
          href={d.href}
          className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
        >
          {body}
        </Link>
      ) : (
        <div className="relative flex items-center gap-3 px-3 py-2.5">{body}</div>
      )}
    </li>
  );
}
