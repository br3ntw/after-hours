"use client";

import clsx from "clsx";
import { useId, useState } from "react";

import { STATUS_META } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import type { Attraction, AttractionStatus } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-provider";
import { useChangeStatus } from "@/lib/queries";
import { toast } from "@/lib/realtime/toast-store";

const ORDER: AttractionStatus[] = ["operating", "delayed", "down", "closed", "refurb"];
const NEEDS_REASON = new Set<AttractionStatus>(["down", "closed", "refurb", "delayed"]);

/**
 * Change an attraction's status. Disruptive changes ask for a reason (it lands in the
 * status history and the audit log). Hidden for roles without the permission; the API
 * enforces it regardless.
 */
export function StatusControl({
  attraction,
  compact = false,
}: {
  attraction: Attraction;
  compact?: boolean;
}) {
  const { can } = useAuth();
  const mutation = useChangeStatus(attraction.slug);
  const [pending, setPending] = useState<AttractionStatus | null>(null);
  const [reason, setReason] = useState("");
  const reasonId = useId(); // unique even if this control is mounted twice

  if (!can("attractions:change_status")) {
    return <p className="text-xs text-ink-faint">Your role can view status but not change it.</p>;
  }

  const submit = (status: AttractionStatus, why?: string) =>
    mutation.mutate(
      { status, reason: why || undefined },
      {
        onSuccess: () => {
          toast({
            tone: "success",
            title: `${attraction.name} is now ${STATUS_META[status].label.toLowerCase()}`,
          });
          setPending(null);
          setReason("");
        },
        onError: (err) =>
          toast({
            tone: "critical",
            title: "Status change failed",
            body: err instanceof ApiError ? err.message : undefined,
          }),
      },
    );

  return (
    <div className="space-y-2.5">
      <div
        role="group"
        aria-label="Set attraction status"
        className={clsx(
          "grid gap-1.5",
          compact ? "grid-cols-3" : "grid-cols-[repeat(auto-fit,minmax(104px,1fr))]",
        )}
      >
        {ORDER.filter((s) => !compact || s !== "refurb").map((s) => {
          const meta = STATUS_META[s];
          const current = attraction.status === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={current}
              disabled={current || mutation.isPending}
              onClick={() => (NEEDS_REASON.has(s) ? setPending(s) : submit(s))}
              className={clsx(
                "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium",
                "transition-[background-color,border-color,transform] duration-(--duration-fast) ease-(--ease-out) active:scale-[0.97]",
                current
                  ? clsx(meta.bg, meta.text, "border-current")
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
                pending === s && "border-primary text-ink",
              )}
            >
              <meta.icon aria-hidden className="size-3.5" />
              {s === "refurb" ? "Refurb" : meta.label}
            </button>
          );
        })}
      </div>
      {pending && (
        <form
          className="flex animate-enter gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(pending, reason.trim());
          }}
        >
          <label className="sr-only" htmlFor={reasonId}>
            Reason for {STATUS_META[pending].label}
          </label>
          <input
            id={reasonId}
            autoFocus
            value={reason}
            maxLength={280}
            onChange={(e) => setReason(e.target.value)}
            placeholder={`Reason (e.g. ${pending === "delayed" ? "guest assist" : "inspection"})`}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
          />
          <Button
            size="sm"
            variant={pending === "down" ? "danger" : "primary"}
            type="submit"
            disabled={mutation.isPending}
          >
            Set {STATUS_META[pending].label.toLowerCase()}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
