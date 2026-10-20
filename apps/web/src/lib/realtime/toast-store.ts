import { useSyncExternalStore } from "react";

export type ToastTone = "info" | "success" | "warning" | "critical";
export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
  href?: string;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(t: Omit<Toast, "id">, ttlMs = 6000): void {
  const id = nextId++;
  toasts = [...toasts.slice(-3), { ...t, id }]; // at most four on screen
  emit();
  setTimeout(() => dismissToast(id), ttlMs);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useToasts = () =>
  useSyncExternalStore(
    subscribe,
    () => toasts,
    () => toasts,
  );
