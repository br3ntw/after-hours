"use client";

import clsx from "clsx";
import { Cog, HelpCircle, ShieldAlert, Zap } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import type { IssueType, Severity, TicketDetail } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-provider";
import { useAssignNewTicket, useAttractions, useCreateTicket, useTechnicians } from "@/lib/queries";
import { toast } from "@/lib/realtime/toast-store";

const ISSUE_TYPES: { value: IssueType; label: string; icon: typeof Cog }[] = [
  { value: "mechanical", label: "Mechanical", icon: Cog },
  { value: "electrical", label: "Electrical", icon: Zap },
  { value: "safety", label: "Safety", icon: ShieldAlert },
  { value: "other", label: "Other", icon: HelpCircle },
];

/** Plain-language severity names; the SEV code stays visible for people who think in it. */
const SEVERITIES: { value: Severity; label: string; active: string }[] = [
  { value: "sev4", label: "Low", active: "border-ok/60 bg-ok/14 text-ok" },
  { value: "sev3", label: "Medium", active: "border-primary/70 bg-primary/16 text-primary-ink" },
  { value: "sev2", label: "High", active: "border-warn/60 bg-warn/14 text-warn" },
  { value: "sev1", label: "Critical", active: "border-crit/70 bg-crit/16 text-crit" },
];

const field =
  "w-full rounded-xl border border-white/10 bg-canvas/60 px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none";

const segment =
  "cursor-pointer rounded-xl border px-2 py-2 text-center text-[13px] font-medium transition-colors duration-(--duration-fast) has-focus-visible:outline-2 has-focus-visible:outline-primary";

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

export function TicketForm({
  defaultAttraction,
  onCreated,
  onCancel,
}: {
  defaultAttraction?: string;
  onCreated: (ticket: TicketDetail) => void;
  onCancel: () => void;
}) {
  const { can } = useAuth();
  const { data: attractions } = useAttractions();
  const canAssign = can("tickets:assign");
  const { data: techs } = useTechnicians();
  const create = useCreateTicket();
  const assign = useAssignNewTicket();
  const [issueType, setIssueType] = useState<IssueType>("mechanical");
  const [severity, setSeverity] = useState<Severity>("sev3");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const busy = create.isPending || assign.isPending;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setError(null);
        create.mutate(
          {
            attraction_slug: String(form.get("attraction")),
            title: String(form.get("title")).trim(),
            description: String(form.get("description")).trim(),
            issue_type: issueType,
            severity,
          },
          {
            onSuccess: (ticket) => {
              const done = (who?: string) => {
                toast({
                  tone: "success",
                  title: `${ticket.ref} created`,
                  body: who ? `${ticket.title} · assigned to ${who}` : ticket.title,
                });
                onCreated(ticket);
              };
              const tech = techs?.find((t) => t.id === assignee);
              if (!tech) return done();
              // Created first, then assigned: if assigning fails the ticket still exists.
              assign.mutate(
                { id: ticket.id, assigneeId: tech.id },
                {
                  onSuccess: () => done(tech.full_name),
                  onError: () => {
                    toast({ tone: "warning", title: `${ticket.ref} created, but not assigned` });
                    onCreated(ticket);
                  },
                },
              );
            },
            onError: (err) =>
              setError(err instanceof ApiError ? err.message : "Could not create the work order."),
          },
        );
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor={`${uid}-t-attraction`} className="text-[13px] font-medium text-ink-muted">
          Attraction
        </label>
        <select
          id={`${uid}-t-attraction`}
          name="attraction"
          defaultValue={defaultAttraction}
          required
          className={field}
        >
          {attractions?.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.name} · {a.land.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-[13px] font-medium text-ink-muted">Issue type</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ISSUE_TYPES.map((t) => (
            <label
              key={t.value}
              className={clsx(
                segment,
                "inline-flex items-center justify-center gap-1.5",
                issueType === t.value
                  ? "border-primary bg-primary-fill text-white"
                  : "border-white/10 bg-white/[0.03] text-ink-muted hover:text-ink",
              )}
            >
              <input
                type="radio"
                name="issue_type"
                value={t.value}
                checked={issueType === t.value}
                onChange={() => setIssueType(t.value)}
                className="sr-only"
              />
              <t.icon aria-hidden className="size-4" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-[13px] font-medium text-ink-muted">Severity</legend>
        <div className="grid grid-cols-4 gap-2">
          {SEVERITIES.map((s) => (
            <label
              key={s.value}
              className={clsx(
                segment,
                severity === s.value
                  ? s.active
                  : "border-white/10 bg-white/[0.03] text-ink-muted hover:text-ink",
              )}
            >
              <input
                type="radio"
                name="severity"
                value={s.value}
                checked={severity === s.value}
                onChange={() => setSeverity(s.value)}
                className="sr-only"
              />
              {s.label}
              <span className="sr-only"> ({s.value.toUpperCase()})</span>
            </label>
          ))}
        </div>
        {severity === "sev1" && (
          <p className="animate-enter text-xs text-crit">
            Critical (SEV1) is a safety stop: creating it takes the attraction down until the ticket is
            resolved.
          </p>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor={`${uid}-t-title`} className="text-[13px] font-medium text-ink-muted">
          Summary
        </label>
        <input
          id={`${uid}-t-title`}
          name="title"
          required
          minLength={3}
          maxLength={140}
          placeholder="e.g. Lift motor overheating on cycle 3"
          className={field}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${uid}-t-desc`} className="text-[13px] font-medium text-ink-muted">
          Description <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <textarea
          id={`${uid}-t-desc`}
          name="description"
          rows={3}
          maxLength={4000}
          placeholder="What did you observe?"
          className={field}
        />
      </div>

      {canAssign && (
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-muted">
            Assign to <span className="font-normal text-ink-faint">(optional)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {[{ id: null, full_name: "Unassigned" }, ...(techs ?? [])].map((t) => (
              <label
                key={t.id ?? "none"}
                className={clsx(
                  segment,
                  "inline-flex items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5",
                  assignee === t.id
                    ? "border-primary bg-primary/16 text-ink"
                    : "border-white/10 bg-white/[0.03] text-ink-muted hover:text-ink",
                )}
              >
                <input
                  type="radio"
                  name="assignee"
                  checked={assignee === t.id}
                  onChange={() => setAssignee(t.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={clsx(
                    "grid size-6 place-items-center rounded-full text-[10px] font-semibold",
                    t.id
                      ? "bg-gradient-to-br from-primary to-purple text-white"
                      : "bg-white/10 text-ink-muted",
                  )}
                >
                  {t.id ? initials(t.full_name) : "–"}
                </span>
                {t.full_name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="text-sm text-crit">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-white/8 pt-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={severity === "sev1" ? "danger" : "primary"} type="submit" disabled={busy}>
          {busy ? "Creating…" : severity === "sev1" ? "Create & stop ride" : "Create ticket"}
        </Button>
      </div>
    </form>
  );
}
