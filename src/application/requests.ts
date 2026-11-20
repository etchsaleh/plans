import { v7 as uuid } from "uuid";
import { fromLondon, londonParts } from "@/domain/london-time";
import { viewOption, type Option, type OptionView, type Role } from "@/domain/option";
import {
  DomainError,
  startTimes,
  transition,
  validateSearch,
  type RequestEvent,
  type Search,
  type SearchRequest,
} from "@/domain/request";
import type {
  Attendee,
  AvailabilityVerifier,
  Clock,
  JobQueue,
  OptionRepository,
  ParticipationRepository,
  RequestRepository,
  Tally,
  VenueCatalog,
} from "@/ports";

export type RequestDeps = {
  requests: RequestRepository;
  options: OptionRepository;
  participation: ParticipationRepository;
  venues: VenueCatalog;
  verifier: AvailabilityVerifier;
  jobs: JobQueue;
  clock: Clock;
  newToken: () => string;
  /** Upper bound on verifier calls per search (politeness + latency). */
  maxChecks?: number;
};

export class ValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join("; "));
  }
}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

const CATEGORY_LABEL: Record<Search["category"], string> = { restaurant: "Dinner", padel: "Padel", tennis: "Tennis" };

export function groupNameFor(s: Search): string {
  const d = new Date(`${s.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${CATEGORY_LABEL[s.category]} · ${d}`;
}

/** Organiser creates a search. The direct check runs in the background job. */
export async function createRequest(
  deps: RequestDeps,
  input: { organizerUserId: string; organizerParticipantId: string; search: Search },
): Promise<SearchRequest> {
  const now = deps.clock.now();
  const problems = validateSearch(input.search, londonParts(now).date);
  if (problems.length) throw new ValidationError(problems);
  const r: SearchRequest = {
    id: uuid(),
    shareToken: deps.newToken(),
    organizerId: input.organizerUserId,
    groupId: uuid(),
    search: input.search,
    status: "QUEUED",
    selectedOptionId: null,
    bookingReference: null,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
  await deps.requests.create(r, { participantId: input.organizerParticipantId, groupName: groupNameFor(input.search) });
  await deps.jobs.enqueueDirectSearch(r.id);
  return r;
}

/**
 * Runs the direct verifiers over (matching venues × start times in the window).
 * Idempotent: options are upserted per (request, venue, start); re-running replaces nothing that exists.
 */
export async function runDirectSearch(deps: RequestDeps, requestId: string, opts: { recheck?: boolean } = {}): Promise<SearchRequest> {
  let r = await deps.requests.get(requestId);
  if (!r) throw new NotFoundError(requestId);
  if (r.status !== "QUEUED" && r.status !== "CHECKING") return r; // already processed (job retry)
  if (r.status === "QUEUED") r = await apply(deps, r, { type: "checking_started" }, "system");

  const s = r.search;
  const venues = await deps.venues.find({ activity: s.category, areas: s.areas, venueIds: s.venueIds });
  const slots = venues.flatMap((v) => startTimes(s).map((t) => ({ venue: v, start: fromLondon(s.date, t) })));
  const now = deps.clock.now();
  const todo = slots.filter((x) => x.start.getTime() > now.getTime()).slice(0, deps.maxChecks ?? 48);

  const outcome = { available: 0, unavailable: 0, unknown: 0 };
  const found: Option[] = [];
  try {
    for (const { venue, start } of todo) {
      const res = await deps.verifier.check(
        venue,
        { venueId: venue.id, activity: s.category, start, durationMins: s.durationMins, partySize: s.partySize },
        // Re-checks must reach the source, never a cache.
        { purpose: opts.recheck ? "recheck" : "initial", bypassCache: opts.recheck, context: { requestId } },
      );
      if (res.status === "AVAILABLE") {
        outcome.available++;
        const courts = res.matched?.resources.length ?? 1;
        found.push({
          id: uuid(),
          requestId,
          venueId: venue.id,
          venueName: venue.name,
          area: venue.area,
          startsAt: start,
          endsAt: new Date(start.getTime() + s.durationMins * 60000),
          partySize: s.partySize,
          description:
            s.category === "restaurant"
              ? `Table for ${s.partySize}`
              : `${courts} ${s.category} court${courts > 1 ? "s" : ""} · ${s.durationMins} min`,
          checkedAt: res.evidence.checkedAt,
          tier: res.tier,
          source: res.evidence.source,
          snapshotId: res.snapshotId ?? null,
          priceText: res.matched?.priceText ?? null,
          venueUrl: null,
        });
      } else if (res.status === "UNAVAILABLE") outcome.unavailable++;
      else outcome.unknown++;
    }
    if (todo.length === 0) outcome.unknown += venues.length === 0 ? 1 : 0;
    await deps.options.sync(requestId, found);
  } catch (e) {
    return apply(deps, r, { type: "checks_failed", reason: (e as Error).message }, "system");
  }
  return apply(deps, r, { type: "checks_completed", outcome }, "system");
}

async function apply(deps: RequestDeps, r: SearchRequest, e: RequestEvent, actor: string): Promise<SearchRequest> {
  const t = transition(r, e, deps.clock.now());
  await deps.requests.save(t, actor);
  return t.request;
}

export type RequestView = {
  request: SearchRequest;
  role: Role;
  options: (OptionView & { tally: Tally })[];
  attendees: Attendee[];
  selected: OptionView | null;
};

/** Anyone with the share link joins the request's group as a member (invitation by link). */
export async function openRequest(deps: RequestDeps, token: string, participantId: string): Promise<RequestView> {
  const r = await deps.requests.getByShareToken(token);
  if (!r) throw new NotFoundError("request");
  const role = await deps.participation.ensureMember(r.groupId, participantId, "member");
  return view(deps, r, role, participantId);
}

async function view(deps: RequestDeps, r: SearchRequest, role: Role, participantId: string): Promise<RequestView> {
  const [opts, tallies, attendees] = await Promise.all([
    deps.options.listForRequest(r.id),
    deps.participation.tallies(r.id, participantId),
    deps.participation.attendees(r.id),
  ]);
  const sorted = opts.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.venueName.localeCompare(b.venueName));
  return {
    request: role === "organizer" ? r : { ...r, bookingReference: r.bookingReference ? "on file" : null },
    role,
    options: sorted.map((o) => ({ ...viewOption(o, role), tally: tallies.get(o.id) ?? { up: 0, down: 0, mine: null } })),
    attendees,
    selected: r.selectedOptionId ? (sorted.find((o) => o.id === r.selectedOptionId) ? viewOption(sorted.find((o) => o.id === r.selectedOptionId)!, role) : null) : null,
  };
}

async function requireRole(deps: RequestDeps, token: string, participantId: string, needed?: Role) {
  const r = await deps.requests.getByShareToken(token);
  if (!r) throw new NotFoundError("request");
  const role = await deps.participation.roleOf(r.groupId, participantId);
  if (!role) throw new ForbiddenError("open the invite link first");
  if (needed === "organizer" && role !== "organizer") throw new ForbiddenError("only the organiser can do that");
  return { r, role };
}

export async function setPreference(deps: RequestDeps, token: string, participantId: string, optionId: string, value: "up" | "down" | null) {
  const { r } = await requireRole(deps, token, participantId);
  const o = await deps.options.get(optionId);
  if (!o || o.requestId !== r.id) throw new NotFoundError("option");
  await deps.participation.setPreference(optionId, participantId, value);
}

export async function setRsvp(deps: RequestDeps, token: string, participantId: string, value: "in" | "out") {
  const { r } = await requireRole(deps, token, participantId);
  await deps.participation.setRsvp(r.id, participantId, value);
}

/** Records the organiser's choice. NOT a booking — booking is approved outside the app. */
export async function chooseOption(deps: RequestDeps, token: string, participantId: string, optionId: string) {
  const { r } = await requireRole(deps, token, participantId, "organizer");
  const o = await deps.options.get(optionId);
  if (!o || o.requestId !== r.id) throw new NotFoundError("option");
  return apply(deps, r, { type: "select", optionId, optionStartsAt: o.startsAt }, `organizer:${participantId}`);
}

export async function organizerAction(
  deps: RequestDeps,
  token: string,
  participantId: string,
  action: { type: "unselect" } | { type: "booked"; reference: string } | { type: "booking_failed" } | { type: "cancel" } | { type: "recheck" },
) {
  const { r } = await requireRole(deps, token, participantId, "organizer");
  const actor = `organizer:${participantId}`;
  switch (action.type) {
    case "booked":
      return apply(deps, r, { type: "booking_confirmed", providerReference: action.reference }, actor);
    case "recheck": {
      const next = await apply(deps, r, { type: "recheck_requested" }, actor);
      await deps.jobs.enqueueDirectSearch(r.id, { recheck: true });
      return next;
    }
    case "unselect":
    case "booking_failed":
    case "cancel":
      return apply(deps, r, { type: action.type }, actor);
  }
}

export { DomainError };
