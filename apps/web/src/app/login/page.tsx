"use client";

import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { LogoMark } from "@/components/app-shell";
import { ParkArt } from "@/components/park-map/park-art";
import { api, ApiError } from "@/lib/api/client";
import type { Role } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-provider";

const ROLES: { role: Role; title: string; can: string }[] = [
  {
    role: "ops_manager",
    title: "Operations Manager",
    can: "Open and close rides, change dispatch, assign work orders",
  },
  { role: "admin", title: "Administrator", can: "Everything above, plus simulation controls" },
  { role: "technician", title: "Maintenance Technician", can: "Report faults, work assigned orders" },
  { role: "analyst", title: "Read-Only Analyst", can: "Boards, analytics and history; no changes" },
];

const field =
  "w-full rounded-xl border border-white/10 bg-canvas/60 px-3 py-2.5 text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none";

export default function LoginPage() {
  const { state, login, loginAsDemo } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [demo, setDemo] = useState<boolean | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (state.status === "authenticated") router.replace("/");
  }, [state.status, router]);

  useEffect(() => {
    void api.demoEnabled().then(setDemo);
  }, []);

  async function run(key: string, fn: () => Promise<void>) {
    setError(null);
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Invalid email or password."
          : "Sign-on failed. Is the API running?",
      );
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run("form", () => login(String(form.get("email")), String(form.get("password"))));
  }

  return (
    <main className="grid min-h-screen grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:p-10">
      <div className="glass mx-auto w-full max-w-[480px] rounded-3xl p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <LogoMark className="size-11" />
          <div>
            <p className="text-xl leading-tight font-semibold tracking-tight">After Hours</p>
            <p className="text-[11px] font-medium tracking-[0.2em] text-ink-muted">OPERATIONS</p>
          </div>
        </div>
        <h1 className="mt-8 text-[28px] leading-tight font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Sign on to Lanternfall Park, a fictional park. Guests, queues, wait times and faults all come from a
          simulation.
        </p>

        {demo && !showForm && (
          <section aria-labelledby="roles-h" className="mt-6">
            <h2 id="roles-h" className="text-[13px] font-medium text-ink-muted">
              Sign on as
            </h2>
            <ul className="mt-2 space-y-2">
              {ROLES.map(({ role, title, can }) => (
                <li key={role}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run(role, () => loginAsDemo(role))}
                    className="group flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-left transition-colors duration-(--duration-fast) hover:border-primary/50 hover:bg-primary/8 disabled:opacity-60"
                  >
                    <span
                      aria-hidden
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-purple text-sm font-semibold text-white"
                    >
                      {title
                        .split(" ")
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-ink">{title}</span>
                      <span className="block text-[13px] text-ink-muted">
                        {busy === role ? "Signing on…" : can}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden
                      className="size-4 shrink-0 text-ink-faint transition-transform duration-(--duration-fast) group-hover:translate-x-0.5 group-hover:text-ink"
                    />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-4 text-[13px] text-ink-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Sign on with email and password
            </button>
          </section>
        )}

        {(demo === false || showForm) && (
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[13px] font-medium text-ink-muted">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                className={field}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-[13px] font-medium text-ink-muted">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className={field}
              />
            </div>
            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={busy !== null}
                className="h-11 flex-1 rounded-xl bg-primary-fill px-5 font-medium text-white transition-colors hover:bg-primary-fill-hover disabled:opacity-60"
              >
                {busy === "form" ? "Signing on…" : "Sign on"}
              </button>
              {demo && (
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-[13px] text-ink-muted hover:text-ink"
                >
                  Back to roles
                </button>
              )}
            </div>
          </form>
        )}

        {demo === null && <div className="skeleton mt-6 h-72 rounded-2xl" />}
        {error && (
          <p role="alert" className="mt-4 text-sm text-crit">
            {error}
          </p>
        )}
      </div>

      <figure className="relative m-0 hidden overflow-hidden rounded-3xl border border-white/8 lg:block">
        <div className="relative aspect-[10/7] w-full">
          <ParkArt />
        </div>
        <figcaption className="glass absolute bottom-4 left-4 rounded-2xl px-4 py-3">
          <p className="text-[15px] font-semibold">Lanternfall Park</p>
          <p className="text-[13px] text-ink-muted">Fictional park · simulated operations</p>
        </figcaption>
      </figure>
    </main>
  );
}
