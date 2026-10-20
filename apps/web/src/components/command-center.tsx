"use client";

import { ChevronRight, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { ActivityFeed } from "@/components/ops/activity-feed";
import { AttractionPanel } from "@/components/ops/attraction-panel";
import { GuestFlowChart } from "@/components/ops/guest-flow-chart";
import { KpiStrip } from "@/components/ops/kpi-strip";
import { MapFilters } from "@/components/ops/map-filters";
import { useMapState } from "@/components/ops/use-map-state";
import { ParkMap } from "@/components/park-map/park-map";
import type { Overview } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-provider";
import { formatInt } from "@/lib/format";
import { useActivity, useAttractions, useGuestFlow, useOpenTickets, useOverview } from "@/lib/queries";

function greeting(simIso: string | undefined) {
  const h = simIso ? new Date(simIso).getUTCHours() : 12;
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** One factual line about the park right now (no filler copy). */
function summary(o: Overview | undefined): string {
  if (!o) return "Connecting to the park…";
  const stopped = o.attractions_total - o.attractions_up;
  const incidents = Object.values(o.open_incidents).reduce((a, b) => a + b, 0);
  if (stopped === 0 && incidents === 0) return `All ${o.attractions_total} attractions are running smoothly.`;
  const parts = [
    stopped ? `${stopped} attraction${stopped === 1 ? " is" : "s are"} down` : null,
    incidents ? `${incidents} open work order${incidents === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return `${parts.join(" and ")} — everything else is running.`;
}

export function CommandCenter() {
  const { state } = useAuth();
  const { data: overview } = useOverview();
  const { data: attractions } = useAttractions();
  const { data: tickets } = useOpenTickets();
  const { data: activity } = useActivity();
  const { data: flow } = useGuestFlow();
  const map = useMapState(attractions, tickets);
  const first = state.status === "authenticated" ? state.user.full_name.split(" ")[0] : "";

  return (
    <div className="mx-auto max-w-[1680px] space-y-4">
      <header>
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-balance">
          {greeting(overview?.sim.sim_time)}, {first}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{summary(overview)}</p>
      </header>

      <KpiStrip data={overview} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-labelledby="map-title" className="glass min-w-0 rounded-2xl p-3">
          <h2 id="map-title" className="sr-only">
            Live park map
          </h2>
          <div className="mb-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <MapFilters value={map.filters} onChange={map.setFilters} showStatus={false} bare />
            </div>
            <Link
              href="/map"
              className="hidden shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-ink-muted transition-colors hover:text-ink sm:inline-flex"
            >
              <SlidersHorizontal aria-hidden className="size-4" /> View Controls
            </Link>
          </div>
          {attractions ? (
            <ParkMap
              attractions={attractions}
              selected={map.selected}
              onSelect={map.setSelected}
              visible={map.visible}
              alerts={map.alerts}
              showCrowd={map.filters.crowd}
              className="aspect-[10/7] w-full rounded-xl border-white/5"
            >
              {map.selectedAttraction && (
                <AttractionPanel
                  attraction={map.selectedAttraction}
                  tickets={tickets ?? []}
                  onClose={() => map.setSelected(null)}
                />
              )}
            </ParkMap>
          ) : (
            <div className="skeleton aspect-[10/7] w-full rounded-xl" />
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-4 xl:h-full">
          <section
            aria-labelledby="feed-title"
            className="glass flex max-h-[460px] min-h-[260px] flex-col overflow-hidden rounded-2xl xl:max-h-none xl:min-h-0 xl:flex-1 xl:basis-0"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 id="feed-title" className="text-[15px] font-semibold">
                Live Activity
              </h2>
              <Link
                href="/maintenance"
                className="inline-flex items-center gap-0.5 text-[13px] text-[color:var(--color-primary-ink)] transition-colors hover:text-cyan"
              >
                See All <ChevronRight aria-hidden className="size-4" />
              </Link>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ActivityFeed items={activity?.slice(0, 25)} />
            </div>
          </section>

          <section aria-labelledby="flow-title" className="glass rounded-2xl px-4 pt-4 pb-3">
            <div className="flex items-center justify-between">
              <h2 id="flow-title" className="text-[15px] font-semibold">
                Guest Flow
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/12 px-2 py-0.5 text-[11px] font-medium text-ok">
                <span aria-hidden className="size-1.5 rounded-full bg-ok" />
                Live
              </span>
            </div>
            <p className="tnum mt-0.5 text-xs text-ink-muted">
              {flow ? `${formatInt(flow.riders_today)} rides today · simulated` : " "}
            </p>
            <GuestFlowChart data={flow} height={150} />
          </section>
        </div>
      </div>
    </div>
  );
}
