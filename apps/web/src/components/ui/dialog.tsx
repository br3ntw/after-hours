"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

/**
 * Native <dialog>: focus trapping, Esc to close, inert background, and top-layer stacking
 * come from the platform instead of a library.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Unique per instance: several dialogs can be mounted at once (e.g. Reset + New work
  // order), and a shared id would give them all the first dialog's accessible name.
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby={titleId}
      className={`glass m-auto w-[calc(100%-2rem)] ${width} rounded-2xl p-0 text-ink backdrop:bg-canvas/75 backdrop:backdrop-blur-[2px] open:animate-dialog-in`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="px-5 py-4">{open && children}</div>
    </dialog>
  );
}
