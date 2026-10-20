import { ParkMapPage } from "@/components/park-map-page";

// See (ops)/page.tsx: pages in this group render after client-side session restore.
export const instant = false;
export const metadata = { title: "Park Map" };

export default function MapPage() {
  return <ParkMapPage />;
}
