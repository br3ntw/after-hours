"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";
import type { Me, Permission, Role } from "@/lib/api/types";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: Me };

interface AuthContextValue {
  state: AuthState;
  login(email: string, password: string): Promise<void>;
  loginAsDemo(role: Role): Promise<void>;
  logout(): Promise<void>;
  /** UX only: hides controls the user can't use. The API enforces every permission. */
  can(permission: Permission): boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  useEffect(() => {
    let cancelled = false;
    // Restore the session from the httpOnly refresh cookie; the access token lives in memory.
    api.refresh().then((session) => {
      if (cancelled) return;
      setState(
        session ? { status: "authenticated", user: session.user } : { status: "anonymous", user: null },
      );
    });
    const unsubscribe = api.onSessionExpired(() => setState({ status: "anonymous", user: null }));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.login(email, password);
    setState({ status: "authenticated", user: session.user });
  }, []);

  const loginAsDemo = useCallback(async (role: Role) => {
    const session = await api.demoLogin(role);
    setState({ status: "authenticated", user: session.user });
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setState({ status: "anonymous", user: null });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login,
      loginAsDemo,
      logout,
      can: (permission) => state.status === "authenticated" && state.user.permissions.includes(permission),
    }),
    [state, login, loginAsDemo, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
