import { CommandCenter } from "@/components/command-center";

// Pages in the (ops) group render only after the client restores the session (the access
// token lives in memory, recovered from the httpOnly refresh cookie), so navigation into
// them cannot be instant. Each page opts out explicitly; see the (ops) layout's AuthGate.
export const instant = false;

export default function CommandCenterPage() {
  return <CommandCenter />;
}
