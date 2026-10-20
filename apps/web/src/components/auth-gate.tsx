"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth/auth-provider";
import { RealtimeProvider } from "@/lib/realtime/realtime-provider";

/** Client-side guard for UX. Every API call is authorized server-side regardless. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "anonymous") router.replace("/login");
  }, [state.status, router]);

  if (state.status !== "authenticated") {
    return (
      <div role="status" className="grid min-h-screen place-items-center text-sm text-ink-muted">
        Restoring session…
      </div>
    );
  }
  return (
    <RealtimeProvider>
      <AppShell>{children}</AppShell>
    </RealtimeProvider>
  );
}
