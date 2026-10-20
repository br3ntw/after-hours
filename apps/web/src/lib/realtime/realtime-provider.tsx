"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";

import { api } from "@/lib/api/client";

import { applyEvent, EventSequencer, type ServerMessage } from "./events";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";

const ConnectionContext = createContext<ConnectionState>("connecting");
export const useConnection = () => useContext(ConnectionContext);

const WATCHDOG_MS = 40_000; // server pings every 15 s; two missed pings + slack = dead link

function wsOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_AH_WS_ORIGIN;
  if (configured) return configured;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.hostname}:8000`;
}

/** Exponential backoff with full jitter, capped at 15 s. */
export const backoffMs = (attempt: number, random = Math.random) =>
  Math.round(Math.min(15_000, 500 * 2 ** attempt) * (0.5 + random() / 2));

/**
 * One WebSocket per tab. Survives network blips and API restarts: reconnects with backoff,
 * resumes from the last applied stream id (server replays the gap), drops duplicates, and
 * refetches everything when the server says the gap is too old to replay.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<ConnectionState>("connecting");

  useEffect(() => {
    const sequencer = new EventSequencer();
    let socket: WebSocket | null = null;
    let attempt = 0;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    const armWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => socket?.close(4000, "heartbeat timeout"), WATCHDOG_MS);
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      setState(attempt > 4 ? "offline" : "reconnecting");
      retryTimer = setTimeout(connect, backoffMs(attempt++));
    };

    async function connect() {
      if (stopped) return;
      let ticket: string;
      try {
        ({ ticket } = await api.request<{ ticket: string }>("/api/v1/ws-ticket", { method: "POST" }));
      } catch {
        scheduleReconnect();
        return;
      }
      if (stopped) return;
      const since = sequencer.lastId ? `&since=${encodeURIComponent(sequencer.lastId)}` : "";
      socket = new WebSocket(`${wsOrigin()}/ws/events?ticket=${encodeURIComponent(ticket)}${since}`);
      socket.onopen = () => {
        const reconnected = attempt > 0;
        attempt = 0;
        setState("live");
        armWatchdog();
        // Anything that happened while we were away and isn't replayable: refetch snapshots.
        if (reconnected && !sequencer.lastId) void qc.invalidateQueries();
      };
      socket.onmessage = (msg) => {
        armWatchdog();
        const data = JSON.parse(String(msg.data)) as ServerMessage;
        if (data.kind === "event") {
          if (sequencer.accept(data.id)) applyEvent(qc, data);
        } else if (data.kind === "resync_required") {
          void qc.invalidateQueries();
        }
      };
      socket.onclose = () => {
        clearTimeout(watchdog);
        socket = null;
        scheduleReconnect();
      };
    }

    void connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearTimeout(watchdog);
      socket?.close(1000, "unmount");
    };
  }, [qc]);

  return <ConnectionContext value={state}>{children}</ConnectionContext>;
}
