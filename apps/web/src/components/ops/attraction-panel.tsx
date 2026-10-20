"use client";

import { ArrowUpRight, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { SeverityBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { Attraction, Ticket } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-provider";
import { formatInt, formatWait } from "@/lib/format";

import { TYPE_LABEL } from "./map-filters";
import { RideArt } from "./ride-art";
import { StatusControl } from "./status-control";
import { TicketForm } from "./ticket-form";

/** Floating glass panel for the attraction selected on a map. */
export function AttractionPanel({
  attraction: a,
  tickets,
  onClose,
}: {
  attraction: Attraction;
  tickets: Ticket[];
  onClose: () => void;
}) {
  const { can } = useAuth();
  const [reporting, setReporting] = useState(false);
  const open = tickets.filter(
    (t) => t.attraction.slug === a.slug && ["open", "assigned", "in_progress"].includes(t.state),
  );
  const running = a.status === "operating" || a.status === "delayed";

  return (
    <aside
      key={a.slug}
      aria-label={`${a.name} details`}
      className="glass pointer-events-auto absolute top-3 right-3 bottom-3 flex w-[min(340px,calc(100%-1.5rem))] animate-slide-in flex-col overflow-hidden rounded-2xl"
    >
      <div className="relative h-32 shrink-0">
        <RideArt slug={a.slug} land={a.land.slug} type={a.type} className="absolute inset-0 size-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close attraction panel"
          className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/45 text-ink-muted backdrop-blur transition-colors hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
        <div className="absolute inset-x-4 bottom-2">
          <h2 className="text-lg leading-tight font-semibold text-balance">{a.name}</h2>
          <p className="text-[13px] text-ink-muted">
            {TYPE_LABEL[a.type].replace(/s$/, "")} · {a.land.name}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 pt-3">
        <StatusBadge status={a.status} size="sm" />
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pt-3 pb-4">
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Wait", running ? formatWait(a.live?.wait_minutes) : "—"],
            ["In line", formatInt(a.live?.queue_length ?? 0)],
            ["Capacity", `${formatInt(a.hourly_capacity)}/h`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-white/8 bg-white/[0.03] px-2 py-2">
              <dt className="text-[11px] text-ink-muted">{k}</dt>
              <dd className="tnum font-mono text-sm font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        {open.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-warn">
              <Wrench aria-hidden className="size-3.5" /> Open maintenance
            </h3>
            <ul className="space-y-1">
              {open.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/maintenance?ticket=${t.id}`}
                    className="flex items-center gap-2 rounded-lg bg-surface-raised/60 px-2.5 py-1.5 text-[13px] transition-colors hover:bg-surface-hover"
                  >
                    <SeverityBadge severity={t.severity} />
                    <span className="truncate">{t.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold text-ink-muted">Operational status</h3>
          <StatusControl attraction={a} compact />
        </div>

        <div className="flex gap-2 pt-1">
          <Link
            href={`/attractions/${a.slug}`}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-fill px-3 text-sm font-medium text-white transition-colors hover:bg-primary-fill-hover"
          >
            Full details <ArrowUpRight aria-hidden className="size-4" />
          </Link>
          {can("tickets:create") && (
            <Button onClick={() => setReporting(true)}>
              <Wrench aria-hidden className="size-4" /> New work order
            </Button>
          )}
        </div>
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
    </aside>
  );
}
