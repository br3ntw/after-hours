import { Drama, FerrisWheel, RollerCoaster, Sparkles, Tent, Waves, type LucideIcon } from "lucide-react";

import type { AttractionType } from "@/lib/api/types";

/** Each ride type's icon and badge gradient (identity, not state: state keeps its own colors). */
export const RIDE_TYPE: Record<
  AttractionType,
  { icon: LucideIcon; label: string; from: string; to: string }
> = {
  coaster: { icon: RollerCoaster, label: "Coaster", from: "#ff8a4d", to: "#e2453c" },
  dark_ride: { icon: Sparkles, label: "Dark ride", from: "#9b6dff", to: "#5b3fd1" },
  water: { icon: Waves, label: "Water ride", from: "#38d9ff", to: "#2563eb" },
  flat: { icon: FerrisWheel, label: "Flat ride", from: "#f472b6", to: "#c026d3" },
  show: { icon: Drama, label: "Show", from: "#fbbf24", to: "#d97706" },
  family: { icon: Tent, label: "Family", from: "#4ade80", to: "#059669" },
};
