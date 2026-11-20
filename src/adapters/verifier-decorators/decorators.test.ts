import { describe, expect, it, vi } from "vitest";
import type { AvailabilitySnapshot } from "@/domain/availability";
import type { Venue } from "@/domain/venue";
import { MockVerifier } from "@/adapters/mock/mock-verifier";
import { withAudit, withSafety } from "./index";

const clock = { now: () => new Date("2026-11-21T10:00:00Z") };
const venue: Venue = {
  id: "v1", provider: "mock", externalId: "x", name: "X", activity: "padel", area: "A", tags: [], bookingRef: {},
};
const q = { venueId: "v1", activity: "padel" as const, start: new Date("2026-11-21T18:00:00Z"), durationMins: 60, partySize: 4 };

describe("withAudit", () => {
  it("appends a snapshot for every check, with purpose and latency", async () => {
    const appended: AvailabilitySnapshot[] = [];
    const v = withAudit(new MockVerifier(clock), { store: { append: async (s) => void appended.push(s) }, clock }, { planId: "p1" });
    await v.check(venue, q, { purpose: "lock_in" });
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ status: "AVAILABLE", purpose: "lock_in", planId: "p1", verifier: "mock" });
  });

  it("downgrades to UNKNOWN when the audit write fails — unaudited results are never bookable", async () => {
    const warn = vi.fn();
    const v = withAudit(new MockVerifier(clock), {
      store: { append: async () => { throw new Error("db down"); } },
      clock,
      logger: { info: () => {}, warn },
    });
    const r = await v.check(venue, q, { purpose: "initial" });
    expect(r.status).toBe("UNKNOWN");
    expect(warn).toHaveBeenCalled();
  });
});

describe("withSafety", () => {
  it("rejects evidence stamped in the future", async () => {
    const inner = new MockVerifier({ now: () => new Date("2026-11-21T11:00:00Z") });
    const r = await withSafety(inner, clock).check(venue, q, { purpose: "initial" });
    expect(r.status).toBe("UNKNOWN");
    expect(r.reason).toMatch(/future/);
  });
});
