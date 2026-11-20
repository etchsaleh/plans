import type { Activity, BudgetBand } from "./vocabulary";

/**
 * A SearchRequest is what an organiser asks for ("padel, Sat 21 Nov, 18:00–21:00, 4 people, Battersea").
 * It collects Options (checked slots), friends' preferences/RSVPs, and the organiser's selection.
 * The app never books: BOOKED needs provider evidence (a reference entered by the organiser, or later
 * a provider/assistant result). See docs/PLAN.md §3.2.
 */
export const REQUEST_STATUSES = [
  "QUEUED",
  "CHECKING",
  "RESULTS",
  "NO_AVAILABILITY",
  "UNVERIFIED",
  "ERROR",
  "SELECTED",
  "BOOKED",
  "BOOKING_FAILED",
  "NEEDS_RECONCILIATION",
  "CANCELLED",
  "EXPIRED",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type Search = {
  category: Activity;
  /** London local date, explicit — never "today"/"tomorrow". */
  date: string; // YYYY-MM-DD
  earliestStart: string; // HH:MM London
  latestStart: string; // HH:MM London
  durationMins: number;
  partySize: number;
  areas: string[];
  venueIds?: string[];
  budget?: BudgetBand | null;
  notes?: string | null;
};

export type SearchRequest = {
  id: string;
  shareToken: string;
  organizerId: string;
  groupId: string;
  search: Search;
  status: RequestStatus;
  selectedOptionId: string | null;
  bookingReference: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CheckOutcome = { available: number; unavailable: number; unknown: number };

export type RequestEvent =
  | { type: "checking_started" }
  | { type: "checks_completed"; outcome: CheckOutcome }
  | { type: "checks_failed"; reason: string }
  | { type: "recheck_requested" }
  | { type: "select"; optionId: string; optionStartsAt: Date }
  | { type: "unselect" }
  | { type: "booking_confirmed"; providerReference: string }
  | { type: "booking_failed" }
  | { type: "booking_unknown" }
  | { type: "cancel" }
  | { type: "expire" };

export class DomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const TERMINAL: RequestStatus[] = ["BOOKED", "CANCELLED", "EXPIRED"];
const HAS_RESULTS: RequestStatus[] = ["RESULTS", "NO_AVAILABILITY", "UNVERIFIED", "ERROR"];

export type Transition = { request: SearchRequest; from: RequestStatus; to: RequestStatus; cause: string };

/** Pure state machine. Throws DomainError for illegal moves; callers persist the result + history. */
export function transition(r: SearchRequest, e: RequestEvent, now: Date): Transition {
  const from = r.status;
  const go = (to: RequestStatus, patch: Partial<SearchRequest> = {}, cause: string = e.type): Transition => ({
    request: { ...r, ...patch, status: to, version: r.version + 1, updatedAt: now },
    from,
    to,
    cause,
  });
  const illegal = (): never => {
    throw new DomainError("illegal_transition", `cannot ${e.type} when ${from}`);
  };

  if (TERMINAL.includes(from) && e.type !== "expire") illegal();
  if (from === "BOOKED") illegal(); // nothing leaves BOOKED automatically, not even expiry

  switch (e.type) {
    case "checking_started":
      return from === "QUEUED" ? go("CHECKING") : illegal();
    case "checks_completed": {
      if (from !== "CHECKING") illegal();
      const { available, unknown } = e.outcome;
      // "Couldn't check" is never reported as "nothing available".
      const to: RequestStatus = available > 0 ? "RESULTS" : unknown > 0 ? "UNVERIFIED" : "NO_AVAILABILITY";
      return go(to, {}, `checks_completed a=${available} u=${unknown} n=${e.outcome.unavailable}`);
    }
    case "checks_failed":
      return from === "CHECKING" ? go("ERROR", {}, `checks_failed: ${e.reason}`) : illegal();
    case "recheck_requested":
      return HAS_RESULTS.includes(from) || from === "BOOKING_FAILED" ? go("QUEUED") : illegal();
    case "select":
      if (from !== "RESULTS" && from !== "SELECTED" && from !== "BOOKING_FAILED") illegal();
      if (e.optionStartsAt.getTime() <= now.getTime()) throw new DomainError("option_in_past", "that slot has already started");
      return go("SELECTED", { selectedOptionId: e.optionId }, `select ${e.optionId}`);
    case "unselect":
      return from === "SELECTED" ? go("RESULTS", { selectedOptionId: null }) : illegal();
    case "booking_confirmed": {
      if (from !== "SELECTED" && from !== "NEEDS_RECONCILIATION") illegal();
      const ref = e.providerReference.trim();
      if (ref.length < 3) throw new DomainError("evidence_required", "a provider booking reference is required");
      return go("BOOKED", { bookingReference: ref }, "booking_confirmed");
    }
    case "booking_failed":
      return from === "SELECTED" || from === "NEEDS_RECONCILIATION" ? go("BOOKING_FAILED") : illegal();
    case "booking_unknown":
      // Needs a human to reconcile; never triggers an automatic retry.
      return from === "SELECTED" ? go("NEEDS_RECONCILIATION") : illegal();
    case "cancel":
      return go("CANCELLED");
    case "expire":
      return go("EXPIRED");
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Server-side validation of a search; returns human-readable problems (empty = valid). */
export function validateSearch(s: Search, today: string, maxHorizonDays = 30): string[] {
  const p: string[] = [];
  if (!DATE.test(s.date) || Number.isNaN(Date.parse(`${s.date}T00:00:00Z`))) p.push("date must be YYYY-MM-DD");
  else {
    const days = (Date.parse(`${s.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
    if (days < 0) p.push("date is in the past");
    if (days > maxHorizonDays) p.push(`date is more than ${maxHorizonDays} days ahead`);
  }
  if (!HHMM.test(s.earliestStart) || !HHMM.test(s.latestStart)) p.push("times must be HH:MM");
  else if (s.latestStart < s.earliestStart) p.push("latest start is before earliest start");
  if (![60, 90, 120].includes(s.durationMins)) p.push("duration must be 60, 90 or 120 minutes");
  if (!Number.isInteger(s.partySize) || s.partySize < 1 || s.partySize > 16) p.push("party size must be 1–16");
  return p;
}

/** Candidate start times inside the window (London HH:MM), every 30 minutes. */
export function startTimes(s: Pick<Search, "earliestStart" | "latestStart">): string[] {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const out: string[] = [];
  for (let m = Math.ceil(toMin(s.earliestStart) / 30) * 30; m <= toMin(s.latestStart); m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}
