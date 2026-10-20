"use client";

import { AttractionPanel } from "@/components/ops/attraction-panel";
import { MapFilters } from "@/components/ops/map-filters";
import { MapLegend } from "@/components/ops/map-legend";
import { useMapState } from "@/components/ops/use-map-state";
import { ParkMap } from "@/components/park-map/park-map";
import { useAttractions, useOpenTickets } from "@/lib/queries";

export function ParkMapPage() {
  const { data: attractions } = useAttractions();
  const { data: tickets } = useOpenTickets();
  const map = useMapState(attractions, tickets);
  const total = attractions?.length ?? 0;

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] min-h-[520px] max-w-[1600px] flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Park map</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Drag to pan, scroll or pinch to zoom, select an attraction for details. Showing {map.visible.size}{" "}
            of {total}.
          </p>
        </div>
      </div>
      {attractions ? (
        <ParkMap
          attractions={attractions}
          selected={map.selected}
          onSelect={map.setSelected}
          visible={map.visible}
          alerts={map.alerts}
          showCrowd={map.filters.crowd}
          className="min-h-0 flex-1"
        >
          <div className="absolute top-3 left-3 max-w-[calc(100%-1.5rem)]">
            <MapFilters value={map.filters} onChange={map.setFilters} />
          </div>
          <div className="absolute bottom-3 left-3">
            <MapLegend />
          </div>
          {map.visible.size === 0 && (
            <p
              role="status"
              className="glass pointer-events-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl px-4 py-3 text-sm"
            >
              No attractions match these filters.
            </p>
          )}
          {map.selectedAttraction && (
            <AttractionPanel
              attraction={map.selectedAttraction}
              tickets={tickets ?? []}
              onClose={() => map.setSelected(null)}
            />
          )}
        </ParkMap>
      ) : (
        <div className="skeleton flex-1 rounded-2xl" />
      )}
    </div>
  );
}
