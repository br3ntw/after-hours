import clsx from "clsx";
import { CircleCheck, CircleSlash, Clock, TriangleAlert, Wrench, type LucideIcon } from "lucide-react";

import type { AttractionStatus } from "@/lib/api/types";

// Status is always conveyed by icon + text, never by color alone (WCAG 1.4.1).
export const STATUS_META: Record<
  AttractionStatus,
  { label: string; icon: LucideIcon; text: string; bg: string; dot: string }
> = {
  operating: { label: "Operating", icon: CircleCheck, text: "text-ok", bg: "bg-ok/12", dot: "bg-ok" },
  delayed: { label: "Delayed", icon: Clock, text: "text-warn", bg: "bg-warn/12", dot: "bg-warn" },
  down: { label: "Down", icon: TriangleAlert, text: "text-crit", bg: "bg-crit/14", dot: "bg-crit" },
  closed: { label: "Closed", icon: CircleSlash, text: "text-closed", bg: "bg-closed/12", dot: "bg-closed" },
  refurb: { label: "Refurbishment", icon: Wrench, text: "text-refurb", bg: "bg-refurb/12", dot: "bg-refurb" },
};

export function StatusBadge({ status, size = "md" }: { status: AttractionStatus; size?: "sm" | "md" }) {
  const { label, icon: Icon, text, bg } = STATUS_META[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset ring-current/25",
        text,
        bg,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-[13px]",
      )}
    >
      <Icon aria-hidden className={size === "sm" ? "size-3.5" : "size-4"} />
      {label}
    </span>
  );
}
