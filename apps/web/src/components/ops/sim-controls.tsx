"use client";

import clsx from "clsx";
import { FlaskConical, Pause, Play, RotateCcw, Zap } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { formatSimClock } from "@/lib/format";
import { useAttractions, useSim, useSimControl, useTriggerDowntime } from "@/lib/queries";
import { toast } from "@/lib/realtime/toast-store";

const SPEED_LABEL: Record<number, string> = { 0.5: "½×", 1: "1×", 2: "2×", 5: "5×", 10: "10×" };

/** Demo Mode: drive the simulation. Visible to everyone; controllable by administrators. */
export function SimControls() {
  const { can } = useAuth();
  const { data: sim } = useSim();
  const control = useSimControl();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allowed = can("simulation:control");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (action: Parameters<typeof control.mutate>[0], done: string) =>
    control.mutate(action, {
      onSuccess: () => toast({ tone: "info", title: done }),
      onError: (e) =>
        toast({
          tone: "critical",
          title: "Simulation control failed",
          body: e instanceof ApiError ? e.message : undefined,
        }),
    });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Demo mode: simulation ${sim?.running ? "running" : "paused"}${sim ? `, ${formatSimClock(sim.sim_time)} park time, speed ${SPEED_LABEL[sim.speed] ?? sim.speed}` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-purple/35 bg-purple/10 px-3 text-sm text-purple-ink transition-colors duration-(--duration-fast) hover:bg-purple/18"
      >
        {sim?.running ? (
          <Play aria-hidden className="size-3.5 fill-current text-ok" />
        ) : (
          <Pause aria-hidden className="size-3.5 fill-current text-warn" />
        )}
        <span className="hidden font-medium sm:inline">Demo mode</span>
        <span className="tnum font-mono text-xs whitespace-nowrap text-purple-ink">
          {sim ? `${formatSimClock(sim.sim_time)} · ${SPEED_LABEL[sim.speed] ?? `${sim.speed}×`}` : "…"}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Simulation controls"
          className="glass absolute top-11 right-0 z-40 w-[min(320px,calc(100vw-2rem))] animate-dialog-in rounded-2xl p-4"
        >
          <div className="flex items-start gap-2.5">
            <FlaskConical aria-hidden className="mt-0.5 size-4 text-purple" />
            <div>
              <p className="text-sm font-semibold">Simulation</p>
              <p className="text-xs text-ink-muted">
                Generates fictional guests, queues, and incidents. {sim?.running ? "Running" : "Paused"} at{" "}
                {sim ? formatSimClock(sim.sim_time) : "…"} park time.
              </p>
            </div>
          </div>

          {!allowed ? (
            <p className="mt-3 rounded-lg bg-surface-raised px-3 py-2 text-xs text-ink-muted">
              Only Administrators can control the simulation. Sign out and choose{" "}
              <strong className="text-ink">Administrator</strong> to try it.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex gap-2">
                {sim?.running ? (
                  <Button className="flex-1" onClick={() => run({ kind: "pause" }, "Simulation paused")}>
                    <Pause aria-hidden className="size-4" /> Pause
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => run({ kind: "start" }, "Simulation running")}
                  >
                    <Play aria-hidden className="size-4" /> Start
                  </Button>
                )}
                <Button onClick={() => setConfirmReset(true)}>
                  <RotateCcw aria-hidden className="size-4" /> Reset
                </Button>
              </div>

              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-ink-muted">
                  Speed (simulated minutes per tick)
                </legend>
                <div className="grid grid-cols-5 gap-1">
                  {(sim?.speeds ?? [0.5, 1, 2, 5, 10]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={sim?.speed === s}
                      onClick={() => run({ kind: "speed", speed: s }, `Speed ${SPEED_LABEL[s] ?? s}`)}
                      className={clsx(
                        "h-8 rounded-lg border text-xs font-medium transition-colors duration-(--duration-fast)",
                        sim?.speed === s
                          ? "border-purple bg-purple/20 text-ink"
                          : "border-line text-ink-muted hover:text-ink",
                      )}
                    >
                      {SPEED_LABEL[s] ?? `${s}×`}
                    </button>
                  ))}
                </div>
              </fieldset>

              <DowntimeDrill />
            </div>
          )}
        </div>
      )}
      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset the park?"
        description="The simulated clock jumps to 2:00 PM, every attraction reopens, open tickets close, and telemetry is regenerated. Status history and the audit log are kept."
        width="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmReset(false);
              setOpen(false);
              run({ kind: "reset" }, "Park reset to 2:00 PM");
            }}
          >
            <RotateCcw aria-hidden className="size-4" /> Reset park
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function DowntimeDrill() {
  const { data: attractions } = useAttractions();
  const trigger = useTriggerDowntime();
  const uid = useId();
  const running = attractions?.filter((a) => a.status === "operating" || a.status === "delayed") ?? [];
  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        trigger.mutate(
          { attraction_slug: String(f.get("slug")), minutes: Number(f.get("minutes")) },
          {
            onSuccess: (r) =>
              toast({
                tone: "warning",
                title: `Downtime drill started (${r.ref})`,
                body: "The simulation will assign and repair it.",
              }),
            onError: (err) =>
              toast({
                tone: "critical",
                title: "Could not trigger downtime",
                body: err instanceof ApiError ? err.message : undefined,
              }),
          },
        );
      }}
    >
      <p className="text-xs font-medium text-ink-muted">Trigger downtime</p>
      <div className="flex gap-1.5">
        <label className="sr-only" htmlFor={`${uid}-drill-slug`}>
          Attraction
        </label>
        <select
          id={`${uid}-drill-slug`}
          name="slug"
          required
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2 text-xs text-ink"
        >
          {running.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`${uid}-drill-min`}>
          Repair time
        </label>
        <select
          id={`${uid}-drill-min`}
          name="minutes"
          defaultValue="30"
          className="h-8 rounded-lg border border-line bg-canvas px-2 text-xs text-ink"
        >
          {[15, 30, 60, 120].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
        <Button size="sm" variant="danger" type="submit" disabled={trigger.isPending || running.length === 0}>
          <Zap aria-hidden className="size-3.5" /> Go
        </Button>
      </div>
    </form>
  );
}
