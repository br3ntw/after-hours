/** Friendly aliases over the generated OpenAPI types (schema.d.ts, `npm run gen:api`). */
import type { components } from "./schema";

type Schemas = components["schemas"];

export type Attraction = Schemas["AttractionOut"];
export type AttractionStatus = Attraction["status"];
export type AttractionType = Attraction["type"];
export type Live = Schemas["LiveOut"];
export type Land = Schemas["LandOut"];
export type StatusInterval = Schemas["StatusIntervalOut"];
export type MetricPoint = Schemas["MetricPointOut"];
export type Me = Schemas["MeOut"];
export type Permission = Me["permissions"][number];
export type Role = Me["role"];
export type TokenResponse = Schemas["TokenOut"];

export type Ticket = Schemas["TicketOut"];
export type TicketDetail = Schemas["TicketDetailOut"];
export type TicketEvent = Schemas["TicketEventOut"];
export type TicketCreate = Schemas["TicketCreateIn"];
export type TicketState = Ticket["state"];
export type Severity = Ticket["severity"];
export type IssueType = Ticket["issue_type"];
export type Person = Schemas["PersonOut"];

export type Overview = Schemas["OverviewOut"];
export type SimState = Schemas["SimStateOut"];
export type GuestFlow = Schemas["GuestFlowOut"];
export type Reliability = Schemas["ReliabilityOut"];
export type ActivityItem = Schemas["ActivityItem"];
