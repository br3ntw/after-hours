"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import type {
  ActivityItem,
  Attraction,
  AttractionStatus,
  GuestFlow,
  MetricPoint,
  Overview,
  Person,
  Reliability,
  SimState,
  StatusInterval,
  Ticket,
  TicketCreate,
  TicketDetail,
  TicketState,
} from "@/lib/api/types";

export const keys = {
  attractions: ["attractions"] as const,
  attraction: (slug: string) => ["attractions", slug] as const,
  metrics: (slug: string) => ["attractions", slug, "metrics"] as const,
  history: (slug: string) => ["attractions", slug, "history"] as const,
  overview: ["overview"] as const,
  activity: ["activity"] as const,
  guestFlow: ["guest-flow"] as const,
  reliability: ["reliability"] as const,
  sim: ["sim"] as const,
  tickets: ["tickets"] as const,
  ticket: (id: string) => ["tickets", id] as const,
  openTickets: ["tickets", "open"] as const,
  technicians: ["technicians"] as const,
};

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const useAttractions = () =>
  useQuery({ queryKey: keys.attractions, queryFn: () => api.get<Attraction[]>("/api/v1/attractions") });

export const useAttraction = (slug: string) =>
  useQuery({
    queryKey: keys.attraction(slug),
    queryFn: () => api.get<Attraction>(`/api/v1/attractions/${slug}`),
  });

export const useMetrics = (slug: string) =>
  useQuery({
    queryKey: keys.metrics(slug),
    queryFn: () => api.get<MetricPoint[]>(`/api/v1/attractions/${slug}/metrics?limit=240`),
    refetchInterval: 10_000,
  });

export const useStatusHistory = (slug: string) =>
  useQuery({
    queryKey: keys.history(slug),
    queryFn: () => api.get<StatusInterval[]>(`/api/v1/attractions/${slug}/status-history?limit=20`),
  });

export const useOverview = () =>
  useQuery({
    queryKey: keys.overview,
    queryFn: () => api.get<Overview>("/api/v1/overview"),
    refetchInterval: 15_000,
  });

export const useActivity = () =>
  useQuery({ queryKey: keys.activity, queryFn: () => api.get<ActivityItem[]>("/api/v1/activity?limit=40") });

export const useGuestFlow = () =>
  useQuery({
    queryKey: keys.guestFlow,
    queryFn: () => api.get<GuestFlow>("/api/v1/analytics/guest-flow?max_points=120"),
    refetchInterval: 10_000,
  });

export const useReliability = () =>
  useQuery({
    queryKey: keys.reliability,
    queryFn: () => api.get<Reliability>("/api/v1/analytics/reliability?hours=24"),
    refetchInterval: 20_000,
  });

export const useSim = () =>
  useQuery({ queryKey: keys.sim, queryFn: () => api.get<SimState>("/api/v1/simulation") });

export const useTickets = () =>
  useQuery({ queryKey: keys.tickets, queryFn: () => api.get<Ticket[]>("/api/v1/tickets?limit=300") });

/** Open orders only: what the map, dashboard and search need (a fraction of the full list). */
export const useOpenTickets = () =>
  useQuery({
    queryKey: keys.openTickets,
    queryFn: () => api.get<Ticket[]>("/api/v1/tickets?open_only=true&limit=300"),
  });

export const useTicket = (id: string | null) =>
  useQuery({
    queryKey: keys.ticket(id ?? "none"),
    queryFn: () => api.get<TicketDetail>(`/api/v1/tickets/${id}`),
    enabled: id !== null,
  });

export const useTechnicians = () =>
  useQuery({
    queryKey: keys.technicians,
    queryFn: () => api.get<Person[]>("/api/v1/technicians"),
    staleTime: 5 * 60_000,
  });

/** Mutations invalidate what they touch; the WebSocket echo then keeps every view current. */
function useInvalidate() {
  const qc = useQueryClient();
  return (...queryKeys: readonly (readonly unknown[])[]) =>
    Promise.all(queryKeys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export function useChangeStatus(slug: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { status: AttractionStatus; reason?: string }) =>
      api.request<Attraction>(`/api/v1/attractions/${slug}/status`, json(body)),
    onSuccess: () => invalidate(keys.attractions, keys.overview, keys.activity, keys.reliability),
  });
}

export function useConfigure(slug: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { version: number; riders_per_dispatch?: number; dispatch_interval_s?: number }) =>
      api.request<Attraction>(`/api/v1/attractions/${slug}`, { method: "PATCH", body: JSON.stringify(body) }),
    // On a 409 too: reload so the form shows what the other editor saved.
    onSettled: () => invalidate(keys.attractions),
  });
}

export function useCreateTicket() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: TicketCreate) => api.request<TicketDetail>("/api/v1/tickets", json(body)),
    onSuccess: () => invalidate(keys.tickets, keys.attractions, keys.overview, keys.activity),
  });
}

export function useAssignTicket(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (assigneeId: string) =>
      api.request<TicketDetail>(`/api/v1/tickets/${id}/assign`, json({ assignee_id: assigneeId })),
    onSuccess: () => invalidate(keys.tickets, keys.activity),
  });
}

/** Assign a ticket whose id is only known at call time (e.g. right after creating it). */
export function useAssignNewTicket() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string }) =>
      api.request<TicketDetail>(`/api/v1/tickets/${id}/assign`, json({ assignee_id: assigneeId })),
    onSuccess: () => invalidate(keys.tickets, keys.activity),
  });
}

export function useTransitionTicket(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { to_state: TicketState; note?: string }) =>
      api.request<TicketDetail>(`/api/v1/tickets/${id}/transition`, json(body)),
    onSuccess: () => invalidate(keys.tickets, keys.attractions, keys.overview, keys.activity),
  });
}

export function useSimControl() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (action: { kind: "start" | "pause" | "reset" } | { kind: "speed"; speed: number }) =>
      action.kind === "speed"
        ? api.request<SimState>("/api/v1/simulation/speed", json({ speed: action.speed }))
        : api.request<SimState>(`/api/v1/simulation/${action.kind}`, { method: "POST" }),
    onSuccess: () => invalidate(keys.sim, keys.overview),
  });
}

export function useTriggerDowntime() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { attraction_slug: string; minutes: number }) =>
      api.request<{ ticket_id: string; ref: string }>("/api/v1/simulation/downtime", json(body)),
    onSuccess: () => invalidate(keys.attractions, keys.tickets, keys.overview),
  });
}
