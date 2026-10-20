"use client";

import clsx from "clsx";
import { ArrowUpRight, CheckCircle2, CircleDot, Plus, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { TicketForm } from "@/components/ops/ticket-form";
import { SEVERITY_META, SeverityBadge, STATE_LABEL, TicketStateBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/client";
import type { Severity, Ticket, TicketState } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-provider";
import { formatDuration, formatRelative, formatWallDateTime } from "@/lib/format";
import {
  useAssignTicket,
  useReliability,
  useTechnicians,
  useTicket,
  useTickets,
  useTransitionTicket,
} from "@/lib/queries";
import { toast } from "@/lib/realtime/toast-store";

const ACTIVE = new Set<TicketState>(["open", "assigned", "in_progress"]);

// Mirrors the backend state machine (maintenance/service.py); the API is the authority.
const NEXT: Record<TicketState, { to: TicketState; label: string; tone: "primary" | "secondary" }[]> = {
  open: [{ to: "in_progress", label: "Start work", tone: "primary" }],
  assigned: [{ to: "in_progress", label: "Start work", tone: "primary" }],
  in_progress: [{ to: "resolved", label: "Mark resolved", tone: "primary" }],
  resolved: [
    { to: "closed", label: "Close order", tone: "primary" },
    { to: "in_progress", label: "Reopen", tone: "secondary" },
  ],
  closed: [],
};

type Tab = "active" | "resolved" | "all";

export function MaintenanceCenter() {
  const { state, can } = useAuth();
  const me = state.status === "authenticated" ? state.user : null;
  const { data: tickets } = useTickets();
  const { data: reliability } = useReliability();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = params.get("ticket");
  const [tab, setTab] = useState<Tab>("active");
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [creating, setCreating] = useState(false);

  const select = (id: string | null) =>
    router.replace(id ? `${pathname}?ticket=${id}` : pathname, { scroll: false });

  const rows = useMemo(
    () =>
      (tickets ?? []).filter(
        (t) =>
          (tab === "all" || (tab === "active" ? ACTIVE.has(t.state) : !ACTIVE.has(t.state))) &&
          (!severity || t.severity === severity) &&
          (!mineOnly || t.assignee?.id === me?.id),
      ),
    [tickets, tab, severity, mineOnly, me?.id],
  );

  const active = (tickets ?? []).filter((t) => ACTIVE.has(t.state));
  const bySev = (s: Severity) => active.filter((t) => t.severity === s).length;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Maintenance</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Faults, assignments and repairs. A SEV1 order stops the ride until it&rsquo;s resolved.
          </p>
        </div>
        {can("tickets:create") && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-4" /> New work order
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Summary
          label="Open work orders"
          value={String(active.length)}
          sub={`${active.filter((t) => t.state === "in_progress").length} in progress`}
        />
        <Summary
          label="By severity"
          value={
            <span className="flex gap-1.5">
              {(["sev1", "sev2", "sev3", "sev4"] as Severity[]).map((s) => (
                <span
                  key={s}
                  className={clsx("rounded-md px-1.5 text-sm ring-1 ring-inset", SEVERITY_META[s].className)}
                >
                  {bySev(s)}
                </span>
              ))}
            </span>
          }
          sub="SEV1 · SEV2 · SEV3 · SEV4"
        />
        <Summary
          label="Mean time to recovery"
          value={
            reliability?.mttr_park_minutes != null ? `${Math.round(reliability.mttr_park_minutes)} min` : "—"
          }
          sub={`park time, 24 h · ${reliability?.mttr_minutes != null ? `${Math.round(reliability.mttr_minutes)} min` : "—"} wall clock`}
        />
        <Summary
          label="Resolved (24 h)"
          value={String(reliability?.resolved ?? "—")}
          sub={`${reliability?.incidents ?? 0} opened`}
        />
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Ticket state"
          className="flex rounded-lg border border-line bg-surface p-0.5"
        >
          {(["active", "resolved", "all"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={clsx(
                "rounded-md px-3 py-1.5 text-sm capitalize transition-colors duration-(--duration-fast)",
                tab === t ? "bg-surface-hover text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Severity filter" className="flex gap-1">
          {(["sev1", "sev2", "sev3", "sev4"] as Severity[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={severity === s}
              onClick={() => setSeverity((cur) => (cur === s ? null : s))}
              className={clsx(
                "rounded-md px-2 py-1 font-mono text-xs ring-1 ring-inset transition-opacity",
                SEVERITY_META[s].className,
                severity && severity !== s && "opacity-40",
              )}
            >
              {SEVERITY_META[s].short}
            </button>
          ))}
        </div>
        {me?.role === "technician" && (
          <button
            type="button"
            aria-pressed={mineOnly}
            onClick={() => setMineOnly((m) => !m)}
            className={clsx(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm",
              mineOnly ? "border-cyan/70 bg-cyan/12" : "border-line text-ink-muted",
            )}
          >
            <UserRound aria-hidden className="size-4" /> Assigned to me
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section aria-label="Work orders" className="panel overflow-hidden">
          {!tickets ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-14" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <CheckCircle2 aria-hidden className="mx-auto size-8 text-ok" />
              <p className="mt-2 text-sm font-medium">
                {tab === "active" ? "No open work orders" : "No work orders match"}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {tab === "active"
                  ? "All rides clear. The simulation raises work orders when rides fault."
                  : "Try a different filter."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((t) => (
                <TicketRow key={t.id} t={t} selected={t.id === selectedId} onSelect={() => select(t.id)} />
              ))}
            </ul>
          )}
        </section>

        <div className="lg:sticky lg:top-20 lg:self-start">
          {selectedId ? (
            <TicketDetailPanel id={selectedId} onClose={() => select(null)} />
          ) : (
            <div className="panel grid min-h-[240px] place-items-center px-6 text-center">
              <div>
                <Wrench aria-hidden className="mx-auto size-6 text-ink-faint" />
                <p className="mt-2 text-sm text-ink-muted">
                  Select a work order to see its timeline and act on it.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Create maintenance ticket"
        description="Report a fault at any attraction."
      >
        <TicketForm
          onCreated={(t) => {
            setCreating(false);
            select(t.id);
          }}
          onCancel={() => setCreating(false)}
        />
      </Dialog>
    </div>
  );
}

function Summary({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="tnum mt-1 text-[28px] leading-tight font-semibold tracking-tight">{value}</dd>
      <dd className="mt-0.5 text-[13px] text-ink-muted">{sub}</dd>
    </div>
  );
}

function TicketRow({ t, selected, onSelect }: { t: Ticket; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={clsx(
          "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors duration-(--duration-fast)",
          selected ? "bg-primary/12" : "hover:bg-surface-raised/70",
        )}
      >
        <SeverityBadge severity={t.severity} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            <span className="mr-1.5 font-mono text-xs text-ink-faint">{t.ref}</span>
            {t.title}
          </span>
          <span className="block truncate text-xs text-ink-muted">
            {t.attraction.name} · {t.assignee ? t.assignee.full_name : "Unassigned"}
            {t.source === "simulation" && " · simulated"}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <TicketStateBadge state={t.state} />
          <span className="text-[11px] text-ink-faint">{formatRelative(t.opened_at)}</span>
        </span>
      </button>
    </li>
  );
}

function TicketDetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, can } = useAuth();
  const me = state.status === "authenticated" ? state.user : null;
  const { data: t, error } = useTicket(id);
  const { data: techs } = useTechnicians();
  const assign = useAssignTicket(id);
  const transition = useTransitionTicket(id);
  const [note, setNote] = useState("");
  const uid = useId();

  if (error) return <div className="panel p-5 text-sm text-crit">Could not load this work order.</div>;
  if (!t) return <div className="skeleton h-80 rounded-2xl" />;

  const canAssign = can("tickets:assign") && ACTIVE.has(t.state);
  const canWork = can("tickets:update_any") || (can("tickets:update_own") && t.assignee?.id === me?.id);
  const fail = (e: unknown) =>
    toast({ tone: "critical", title: "Update failed", body: e instanceof ApiError ? e.message : undefined });

  return (
    <article
      aria-labelledby={`${uid}-ticket-title`}
      className="panel animate-slide-in overflow-hidden"
      key={t.id}
    >
      <header className="border-b border-line px-5 py-4">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={t.severity} long />
          <TicketStateBadge state={t.state} />
          <button type="button" onClick={onClose} className="ml-auto text-xs text-ink-muted hover:text-ink">
            Close
          </button>
        </div>
        <h2 id={`${uid}-ticket-title`} className="mt-2 text-lg font-semibold text-balance">
          <span className="mr-2 font-mono text-sm text-ink-faint">{t.ref}</span>
          {t.title}
        </h2>
        <Link
          href={`/attractions/${t.attraction.slug}`}
          className="mt-1 inline-flex items-center gap-1 text-sm text-cyan"
        >
          {t.attraction.name} <ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
        {t.description && <p className="mt-2 text-sm text-ink-muted">{t.description}</p>}
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-4 text-xs">
        <Fact k="Issue type" v={t.issue_type[0]!.toUpperCase() + t.issue_type.slice(1)} />
        <Fact k="Source" v={t.source === "simulation" ? "Simulation" : "Operator"} />
        <Fact k="Opened" v={formatWallDateTime(t.opened_at)} />
        <Fact
          k={t.resolved_at ? "Time to resolve" : "Open for"}
          v={formatDuration(t.opened_at, t.resolved_at)}
        />
        <Fact k="Assignee" v={t.assignee?.full_name ?? "Unassigned"} />
        {t.resolution_notes && <Fact k="Resolution" v={t.resolution_notes} />}
      </dl>

      {(canAssign || (canWork && NEXT[t.state].length > 0)) && (
        <div className="space-y-3 border-t border-line px-5 py-4">
          {canAssign && techs && (
            // Keyed by the current assignee so a reassignment elsewhere resets the picker.
            <AssignForm
              key={t.assignee?.id ?? "none"}
              current={t.assignee?.id ?? ""}
              techs={techs}
              pending={assign.isPending}
              onAssign={(id) =>
                assign.mutate(id, {
                  onSuccess: () => toast({ tone: "success", title: `${t.ref} assigned` }),
                  onError: fail,
                })
              }
            />
          )}
          {canWork && NEXT[t.state].length > 0 && (
            <div className="space-y-2">
              {t.state === "in_progress" && (
                <>
                  <label htmlFor={`${uid}-note`} className="text-xs text-ink-muted">
                    Resolution notes
                  </label>
                  <textarea
                    id={`${uid}-note`}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={2000}
                    placeholder="What was done, parts replaced, test cycles run…"
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
                  />
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {NEXT[t.state].map((n) => (
                  <Button
                    key={n.to}
                    variant={n.tone}
                    disabled={transition.isPending}
                    onClick={() =>
                      transition.mutate(
                        { to_state: n.to, note: note.trim() || undefined },
                        {
                          onSuccess: () => {
                            setNote("");
                            toast({
                              tone: "success",
                              title: `${t.ref} → ${STATE_LABEL[n.to]}`,
                              body:
                                n.to === "resolved" && t.severity === "sev1"
                                  ? "Ride returns to service if no other SEV1 is open."
                                  : undefined,
                            });
                          },
                          onError: fail,
                        },
                      )
                    }
                  >
                    {n.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {!canWork && ACTIVE.has(t.state) && me?.role === "technician" && (
        <p className="border-t border-line px-5 py-3 text-xs text-ink-muted">
          Only the assigned technician (or an operations manager) can work this order.
        </p>
      )}

      <section aria-labelledby={`${uid}-timeline-h`} className="border-t border-line px-5 py-4">
        <h3 id={`${uid}-timeline-h`} className="mb-3 text-xs font-semibold text-ink-muted">
          Timeline
        </h3>
        <ol className="relative space-y-3 before:absolute before:top-1 before:bottom-1 before:left-[7px] before:w-px before:bg-line">
          {t.events.map((e, i) => (
            <li key={i} className="relative flex gap-3 pl-0.5">
              <CircleDot
                aria-hidden
                className={clsx(
                  "relative mt-0.5 size-3.5 shrink-0 bg-surface",
                  e.to_state === "resolved" || e.to_state === "closed" ? "text-ok" : "text-cyan",
                )}
              />
              <div className="min-w-0 text-[13px]">
                <p>
                  <span className="font-medium">
                    {e.kind === "created"
                      ? "Opened"
                      : e.kind === "assigned"
                        ? "Assigned"
                        : e.to_state
                          ? STATE_LABEL[e.to_state]
                          : e.kind}
                  </span>
                  <span className="text-ink-muted"> by {e.actor_name}</span>
                </p>
                {e.note && <p className="text-xs text-ink-muted">{e.note}</p>}
                <p className="text-[11px] text-ink-faint">{formatWallDateTime(e.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

function AssignForm({
  current,
  techs,
  pending,
  onAssign,
}: {
  current: string;
  techs: { id: string; full_name: string }[];
  pending: boolean;
  onAssign: (id: string) => void;
}) {
  const [assignee, setAssignee] = useState(current);
  const assigneeId = useId();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (assignee) onAssign(assignee);
      }}
    >
      <label htmlFor={assigneeId} className="sr-only">
        Technician
      </label>
      <select
        id={assigneeId}
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2.5 text-sm text-ink"
      >
        <option value="" disabled>
          Choose technician…
        </option>
        {techs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={!assignee || assignee === current || pending}>
        {current ? "Reassign" : "Assign"}
      </Button>
    </form>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-faint">{k}</dt>
      <dd className="truncate text-ink">{v}</dd>
    </div>
  );
}
