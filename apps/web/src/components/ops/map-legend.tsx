import { Wrench } from "lucide-react";

import { STATUS_META } from "@/components/status-badge";

/** `compact` drops items the surrounding page already states (unit, simulated badge). */
export function MapLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className="glass pointer-events-auto hidden items-center gap-3 rounded-xl px-3 py-1.5 text-[11px] whitespace-nowrap text-ink-muted lg:flex">
      {(["operating", "delayed", "down", "closed"] as const).map((s) => {
        const meta = STATUS_META[s];
        return (
          <span key={s} className="flex items-center gap-1">
            <meta.icon aria-hidden className={`size-3.5 ${meta.text}`} />
            {meta.label}
          </span>
        );
      })}
      <span className="flex items-center gap-1">
        <span aria-hidden className="grid size-3.5 place-items-center rounded-xs bg-warn text-canvas">
          <Wrench className="size-2" />
        </span>
        Open ticket
      </span>
      {!compact && <span className="text-ink-faint">Numbers = posted wait (min)</span>}
    </div>
  );
}
