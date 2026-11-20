import { describe, expect, it } from "vitest";
import { runAvailabilityVerifierContract } from "@/contracts/availability-verifier.contract";
import type { Venue } from "@/domain/venue";
import { withSafety } from "@/adapters/verifier-decorators";
import { MockVerifier } from "./mock-verifier";

const clock = { now: () => new Date("2026-11-21T10:00:00Z") };
const venue = (scenario: string, extra: Partial<Venue> = {}): Venue => ({
  id: `v-${scenario}`, provider: "mock", externalId: scenario, name: scenario, activity: "padel",
  area: "Battersea", tags: [], bookingRef: { mockScenario: scenario }, ...extra,
});
const q = (time: string, partySize = 4) => ({
  venueId: "v", activity: "padel" as const, start: new Date(`2026-11-21T${time}:00Z`), durationMins: 60, partySize,
});

runAvailabilityVerifierContract("mock", () => ({
  clock,
  tier: "MOCK",
  venue: venue("open"),
  unsupportedVenue: { ...venue("open"), provider: "playtomic" },
  availableQuery: q("18:00"),
  unavailableQuery: q("18:10"),
  make: (mode) => {
    const scenario = { normal: undefined, http_error: "error", garbage: "error", hang: "hang" }[mode];
    const inner = new MockVerifier(clock);
    const safe = withSafety(inner, clock, 2000);
    if (!scenario) return safe;
    return { ...safe, check: (_v, query, opts) => safe.check(venue(scenario), query, opts) };
  },
}));

describe("MockVerifier scenarios", () => {
  it("gone_on_recheck: available first, gone on lock-in", async () => {
    const m = new MockVerifier(clock);
    const v = venue("gone_on_recheck");
    expect((await m.check(v, q("18:00"), { purpose: "initial" })).status).toBe("AVAILABLE");
    expect((await m.check(v, q("18:00"), { purpose: "lock_in", bypassCache: true })).status).toBe("UNAVAILABLE");
  });
  it("allocates two courts for 8 players", async () => {
    const r = await new MockVerifier(clock).check(venue("open"), q("18:00", 8), { purpose: "initial" });
    expect(r.matched?.resources).toHaveLength(2);
  });
  it("full venues are UNAVAILABLE", async () => {
    const r = await new MockVerifier(clock).check(venue("full"), q("18:00"), { purpose: "initial" });
    expect(r.status).toBe("UNAVAILABLE");
  });
});
