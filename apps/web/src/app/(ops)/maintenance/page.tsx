import { Suspense } from "react";

import { MaintenanceCenter } from "@/components/maintenance-center";

export const instant = false;
export const metadata = { title: "Maintenance" };

export default function MaintenancePage() {
  // MaintenanceCenter reads ?ticket= with useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <MaintenanceCenter />
    </Suspense>
  );
}
