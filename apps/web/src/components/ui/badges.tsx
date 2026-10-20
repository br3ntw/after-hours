import clsx from "clsx";

import type { Severity, TicketState } from "@/lib/api/types";

export const SEVERITY_META: Record<Severity, { label: string; short: string; className: string }> = {
  sev1: { label: "SEV1 · Critical", short: "SEV1", className: "bg-crit/15 text-crit ring-crit/40" },
  sev2: { label: "SEV2 · Major", short: "SEV2", className: "bg-warn/14 text-warn ring-warn/40" },
  sev3: { label: "SEV3 · Minor", short: "SEV3", className: "bg-primary/14 text-primary-ink ring-primary/40" },
  sev4: { label: "SEV4 · Low", short: "SEV4", className: "bg-closed/12 text-closed ring-closed/35" },
};

export function SeverityBadge({ severity, long = false }: { severity: Severity; long?: boolean }) {
  const meta = SEVERITY_META[severity];
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        meta.className,
      )}
    >
      {long ? meta.label : meta.short}
    </span>
  );
}

export const STATE_LABEL: Record<TicketState, string> = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export function TicketStateBadge({ state }: { state: TicketState }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        state === "open" && "bg-crit/10 text-crit",
        state === "assigned" && "bg-primary/14 text-primary-ink",
        state === "in_progress" && "bg-warn/12 text-warn",
        (state === "resolved" || state === "closed") && "bg-ok/12 text-ok",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {STATE_LABEL[state]}
    </span>
  );
}
