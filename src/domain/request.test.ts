import { describe, expect, it } from "vitest";
import { DomainError, startTimes, transition, validateSearch, type RequestEvent, type RequestStatus, type SearchRequest } from "./request";
import { checkAgeLabel, viewOption, type Option } from "./option";

const now = new Date("2026-11-21T12:00:00Z");
const req = (status: RequestStatus, extra: Partial<SearchRequest> = {}): SearchRequest => ({
  id: "r1", shareToken: "t", organizerId: "o", groupId: "g", status, selectedOptionId: null, bookingReference: null,
  version: 0, createdAt: now, updatedAt: now,
  search: { category: "padel", date: "2026-11-21", earliestStart: "18:00", latestStart: "21:00", durationMins: 60, partySize: 4, areas: [] },
  ...extra,
});
const later = new Date("2026-11-21T18:00:00Z");

describe("request state machine", () => {
  it("reports RESULTS when anything is available", () => {
    const r = transition(req("CHECKING"), { type: "checks_completed", outcome: { available: 2, unavailable: 5, unknown: 1 } }, now);
    expect(r.to).toBe("RESULTS");
    expect(r.request.version).toBe(1);
  });
  it("never reports 'no availability' when some checks were unknown", () => {
    const r = transition(req("CHECKING"), { type: "checks_completed", outcome: { available: 0, unavailable: 3, unknown: 1 } }, now);
    expect(r.to).toBe("UNVERIFIED");
  });
  it("reports NO_AVAILABILITY only when every check completed", () => {
    expect(transition(req("CHECKING"), { type: "checks_completed", outcome: { available: 0, unavailable: 4, unknown: 0 } }, now).to).toBe("NO_AVAILABILITY");
  });
  it("selecting records a preference, not a booking", () => {
    const r = transition(req("RESULTS"), { type: "select", optionId: "o1", optionStartsAt: later }, now);
    expect(r.to).toBe("SELECTED");
    expect(r.request.bookingReference).toBeNull();
  });
  it("cannot select a slot that already started", () => {
    expect(() => transition(req("RESULTS"), { type: "select", optionId: "o1", optionStartsAt: now }, now)).toThrow(DomainError);
  });
  it("BOOKED requires provider evidence", () => {
    expect(() => transition(req("SELECTED"), { type: "booking_confirmed", providerReference: " " }, now)).toThrow(/reference/);
    expect(transition(req("SELECTED"), { type: "booking_confirmed", providerReference: "PT-12345" }, now).request.bookingReference).toBe("PT-12345");
  });
  it("only a booking confirmation reaches BOOKED", () => {
    const events: RequestEvent[] = [
      { type: "checking_started" }, { type: "checks_completed", outcome: { available: 1, unavailable: 0, unknown: 0 } },
      { type: "select", optionId: "o", optionStartsAt: later }, { type: "unselect" }, { type: "recheck_requested" },
      { type: "booking_failed" }, { type: "booking_unknown" }, { type: "cancel" }, { type: "expire" },
    ];
    for (const status of ["QUEUED", "CHECKING", "RESULTS", "SELECTED", "BOOKING_FAILED", "NEEDS_RECONCILIATION"] as const) {
      for (const e of events) {
        try {
          expect(transition(req(status), e, now).to).not.toBe("BOOKED");
        } catch (err) {
          expect(err).toBeInstanceOf(DomainError);
        }
      }
    }
  });
  it("an unknown booking outcome needs reconciliation and has no retry path", () => {
    const r = transition(req("SELECTED"), { type: "booking_unknown" }, now);
    expect(r.to).toBe("NEEDS_RECONCILIATION");
    expect(() => transition(r.request, { type: "recheck_requested" }, now)).toThrow(DomainError);
  });
  it("nothing leaves BOOKED", () => {
    for (const e of [{ type: "cancel" }, { type: "expire" }, { type: "unselect" }] as RequestEvent[]) {
      expect(() => transition(req("BOOKED"), e, now)).toThrow(DomainError);
    }
  });
  it("terminal states reject further events", () => {
    expect(() => transition(req("CANCELLED"), { type: "recheck_requested" }, now)).toThrow(DomainError);
  });
});

describe("validateSearch", () => {
  const ok = req("QUEUED").search;
  it("accepts a sane search", () => expect(validateSearch(ok, "2026-11-20")).toEqual([]));
  it("rejects past dates, inverted windows, odd durations and party sizes", () => {
    expect(validateSearch({ ...ok, date: "2026-11-19" }, "2026-11-20")).toContain("date is in the past");
    expect(validateSearch({ ...ok, earliestStart: "22:00" }, "2026-11-20")).toContain("latest start is before earliest start");
    expect(validateSearch({ ...ok, durationMins: 45 }, "2026-11-20")).toHaveLength(1);
    expect(validateSearch({ ...ok, partySize: 0 }, "2026-11-20")).toHaveLength(1);
    expect(validateSearch({ ...ok, date: "2027-01-30" }, "2026-11-20")[0]).toMatch(/days ahead/);
  });
});

describe("startTimes", () => {
  it("lists half-hour starts inclusive", () => {
    expect(startTimes({ earliestStart: "18:00", latestStart: "19:30" })).toEqual(["18:00", "18:30", "19:00", "19:30"]);
    expect(startTimes({ earliestStart: "18:10", latestStart: "19:00" })).toEqual(["18:30", "19:00"]);
  });
});

describe("options", () => {
  const o: Option = {
    id: "o", requestId: "r", venueId: "v", venueName: "V", area: "A", startsAt: later, endsAt: later, partySize: 4,
    description: "Court", checkedAt: new Date(now.getTime() - 20 * 60000), tier: "LICENSED", source: "playtomic:https://…",
    snapshotId: "s", priceText: "£52", venueUrl: null,
  };
  it("hides source details from members", () => {
    expect(viewOption(o, "member")).not.toHaveProperty("source");
    expect(viewOption(o, "organizer")).toHaveProperty("source");
  });
  it("labels checks older than 15 minutes", () => {
    expect(checkAgeLabel(o.checkedAt, now)).toEqual({ text: "20 min ago", older: true });
  });
});
