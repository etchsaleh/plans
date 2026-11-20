import { describe, expect, it } from "vitest";
import { classify, isBookable, unitsNeeded, type VerificationResult } from "./availability";

const now = new Date("2026-11-21T12:00:00Z");
const mins = (m: number) => new Date(now.getTime() + m * 60000);

function result(over: Partial<VerificationResult> & { checkedAt?: Date; start?: Date } = {}): VerificationResult {
  const { checkedAt = mins(-1), start = mins(6 * 60), ...rest } = over;
  return {
    status: "AVAILABLE",
    tier: "LICENSED",
    verifier: "test",
    query: { venueId: "v", activity: "padel", start, durationMins: 60, partySize: 4 },
    evidence: { source: "test://", checkedAt, fromCache: false },
    ...rest,
  };
}

describe("isBookable", () => {
  it("accepts a fresh AVAILABLE result", () => {
    expect(isBookable(result(), now)).toBe(true);
  });
  it("accepts exactly 15 minutes old", () => {
    expect(isBookable(result({ checkedAt: mins(-15) }), now)).toBe(true);
  });
  it("rejects anything older than 15 minutes", () => {
    expect(isBookable(result({ checkedAt: new Date(mins(-15).getTime() - 1) }), now)).toBe(false);
  });
  it("never treats UNKNOWN as bookable", () => {
    expect(isBookable(result({ status: "UNKNOWN", reason: "timeout" }), now)).toBe(false);
  });
  it("never treats UNAVAILABLE as bookable", () => {
    expect(isBookable(result({ status: "UNAVAILABLE", reason: "taken" }), now)).toBe(false);
  });
  it("never treats link-only (tier NONE) as bookable, even if it claims AVAILABLE", () => {
    expect(isBookable(result({ tier: "NONE" }), now)).toBe(false);
  });
  it("accepts HUMAN and MOCK tiers when fresh", () => {
    expect(isBookable(result({ tier: "HUMAN" }), now)).toBe(true);
    expect(isBookable(result({ tier: "MOCK" }), now)).toBe(true);
  });
  it("rejects a checkedAt in the future (clock skew / bad data)", () => {
    expect(isBookable(result({ checkedAt: mins(5) }), now)).toBe(false);
  });
  it("rejects slots inside the minimum lead time", () => {
    expect(isBookable(result({ start: mins(30) }), now)).toBe(false);
  });
});

describe("classify", () => {
  it("reports age for stale results so the UI can say 're-checking'", () => {
    expect(classify(result({ checkedAt: mins(-20) }), now)).toEqual({ kind: "stale", ageMins: 20 });
  });
  it("reports bookable with age in minutes", () => {
    expect(classify(result({ checkedAt: mins(-3) }), now)).toEqual({ kind: "bookable", ageMins: 3 });
  });
  it("carries the reason for UNKNOWN", () => {
    expect(classify(result({ status: "UNKNOWN", reason: "timeout" }), now)).toEqual({ kind: "unknown", reason: "timeout" });
  });
});

describe("unitsNeeded", () => {
  it.each([
    ["padel", 1, 1], ["padel", 4, 1], ["padel", 5, 2], ["padel", 8, 2], ["tennis", 9, 3], ["restaurant", 12, 1],
  ] as const)("%s for %i people needs %i", (activity, n, expected) => {
    expect(unitsNeeded(activity, n)).toBe(expected);
  });
  it("rejects non-positive party sizes", () => {
    expect(() => unitsNeeded("padel", 0)).toThrow();
  });
});
