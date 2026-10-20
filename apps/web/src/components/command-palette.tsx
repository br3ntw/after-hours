"use client";

import clsx from "clsx";
import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { STATUS_META } from "@/components/status-badge";
import { useAttractions, useOpenTickets } from "@/lib/queries";

interface Item {
  id: string;
  label: string;
  hint: string;
  href: string;
  group: "Pages" | "Attractions" | "Open tickets";
}

const PAGES: Item[] = [
  { id: "p-cc", label: "Command Center", hint: "Dashboard", href: "/", group: "Pages" },
  { id: "p-map", label: "Park Map", hint: "Full-screen map", href: "/map", group: "Pages" },
  { id: "p-att", label: "Attractions", hint: "All attractions", href: "/attractions", group: "Pages" },
  { id: "p-mt", label: "Maintenance", hint: "Tickets & technicians", href: "/maintenance", group: "Pages" },
  { id: "p-an", label: "Analytics", hint: "Reliability & trends", href: "/analytics", group: "Pages" },
];

/** ⌘K / Ctrl+K search over pages, attractions, and open tickets. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const { data: attractions } = useAttractions();
  const { data: tickets } = useOpenTickets();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      setQuery("");
      setActive(0);
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open]);

  const items = useMemo(() => {
    const all: Item[] = [
      ...PAGES,
      ...(attractions ?? []).map((a) => ({
        id: a.slug,
        label: a.name,
        hint: `${a.land.name} · ${STATUS_META[a.status].label}`,
        href: `/attractions/${a.slug}`,
        group: "Attractions" as const,
      })),
      ...(tickets ?? [])
        .filter((t) => ["open", "assigned", "in_progress"].includes(t.state))
        .map((t) => ({
          id: t.id,
          label: `${t.ref} ${t.title}`,
          hint: t.attraction.name,
          href: `/maintenance?ticket=${t.id}`,
          group: "Open tickets" as const,
        })),
    ];
    const q = query.trim().toLowerCase();
    return (q ? all.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q)) : all).slice(0, 12);
  }, [attractions, tickets, query]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Search attractions, tickets, and pages (Command K)"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-surface/60 text-sm sm:w-full sm:max-w-md sm:justify-start sm:px-3 text-ink-faint transition-colors duration-(--duration-fast) hover:border-line-strong hover:text-ink-muted"
      >
        <Search aria-hidden className="size-4" />
        <span className="hidden flex-1 truncate text-left sm:inline">
          Search attractions, tickets, pages…
        </span>
        <kbd className="hidden rounded border border-line px-1.5 font-sans text-[11px] sm:inline">⌘K</kbd>
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && setOpen(false)}
        aria-label="Search"
        className="glass mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl rounded-2xl p-0 text-ink backdrop:bg-canvas/75 open:animate-dialog-in"
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search aria-hidden className="size-4 text-ink-faint" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pal-${items[active].id}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(items[active]);
              }
            }}
            placeholder="Type to search…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
          />
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">No matches</li>}
          {items.map((item, i) => (
            <li
              key={item.id}
              id={`pal-${item.id}`}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => go(item)}
              className={clsx(
                "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2",
                i === active && "bg-surface-hover",
              )}
            >
              <span className="w-24 shrink-0 text-[11px] text-ink-faint">{item.group}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{item.label}</span>
                <span className="block truncate text-xs text-ink-muted">{item.hint}</span>
              </span>
              {i === active && <CornerDownLeft aria-hidden className="size-3.5 text-ink-faint" />}
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
