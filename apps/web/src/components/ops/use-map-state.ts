"use client";

import { useMemo, useState } from "react";

import type { Attraction, Ticket } from "@/lib/api/types";

import { emptyFilters, type MapFilterState } from "./map-filters";

const OPEN = new Set(["open", "assigned", "in_progress"]);

/** Selection + filters + derived sets shared by the dashboard map and the full map. */
export function useMapState(attractions: Attraction[] | undefined, tickets: Ticket[] | undefined) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filters, setFilters] = useState<MapFilterState>(emptyFilters);

  const visible = useMemo(() => {
    const set = new Set<string>();
    for (const a of attractions ?? []) {
      if (filters.types.size && !filters.types.has(a.type)) continue;
      if (filters.statuses.size && !filters.statuses.has(a.status)) continue;
      set.add(a.slug);
    }
    return set;
  }, [attractions, filters]);

  const alerts = useMemo(
    () => new Set((tickets ?? []).filter((t) => OPEN.has(t.state)).map((t) => t.attraction.slug)),
    [tickets],
  );

  const selectedAttraction = attractions?.find((a) => a.slug === selected) ?? null;
  return { selected, setSelected, filters, setFilters, visible, alerts, selectedAttraction };
}
