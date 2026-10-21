import clsx from "clsx";
import { ExternalLink, MonitorSmartphone } from "lucide-react";

import { BROWSER_DEMO, REPO_URL } from "@/lib/demo/mode";

/**
 * States plainly that the GitHub Pages build runs its API and simulation in the browser,
 * so nobody mistakes it for the full stack (or the full stack for a front-end mock).
 * Renders nothing in the normal build.
 */
export function DemoNotice({ variant = "bar" }: { variant?: "bar" | "card" }) {
  if (!BROWSER_DEMO) return null;
  return (
    <aside
      aria-label="About this demo"
      className={clsx(
        "flex items-start gap-2.5 border border-purple/35 bg-purple/12 text-[13px] text-ink",
        variant === "bar" ? "rounded-xl px-3 py-2" : "mt-5 rounded-2xl px-4 py-3",
      )}
    >
      <MonitorSmartphone
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-[color:var(--color-purple-ink)]"
      />
      <p className="min-w-0">
        <span className="font-semibold">Browser demo.</span> The API and the park simulation run inside your
        browser, and reloading starts a fresh park. The full project runs on FastAPI, PostgreSQL and Redis.{" "}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 whitespace-nowrap text-[color:var(--color-purple-ink)] underline-offset-4 hover:underline"
        >
          Source on GitHub <ExternalLink aria-hidden className="size-3" />
        </a>
      </p>
    </aside>
  );
}
