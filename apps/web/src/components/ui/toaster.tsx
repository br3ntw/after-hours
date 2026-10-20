"use client";

import clsx from "clsx";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import Link from "next/link";

import { dismissToast, useToasts, type ToastTone } from "@/lib/realtime/toast-store";

const TONE: Record<ToastTone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "text-cyan" },
  success: { icon: CircleCheck, className: "text-ok" },
  warning: { icon: TriangleAlert, className: "text-warn" },
  critical: { icon: TriangleAlert, className: "text-crit" },
};

export function Toaster() {
  const toasts = useToasts();
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((t) => {
        const { icon: Icon, className } = TONE[t.tone];
        const body = (
          <>
            <Icon aria-hidden className={clsx("mt-0.5 size-4 shrink-0", className)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 truncate text-[13px] text-ink-muted">{t.body}</p>}
            </div>
          </>
        );
        return (
          <div
            key={t.id}
            role="status"
            className="glass pointer-events-auto flex animate-slide-in items-start gap-3 rounded-xl px-3.5 py-3"
          >
            {t.href ? (
              <Link
                href={t.href}
                className="flex min-w-0 flex-1 items-start gap-3"
                onClick={() => dismissToast(t.id)}
              >
                {body}
              </Link>
            ) : (
              body
            )}
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(t.id)}
              className="rounded p-0.5 text-ink-faint hover:text-ink"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
