import { describe, expect, it } from "vitest";
import type { SlotQuery } from "@/domain/availability";
import type { Venue } from "@/domain/venue";
import type { AvailabilityVerifier, Clock } from "@/ports";

/** What upstream does in a given test. Adapters map these onto their fake transport. */
export type UpstreamMode = "normal" | "http_error" | "garbage" | "hang";

export type VerifierHarness = {
  /** Build a verifier whose upstream behaves per `mode`. Must be wrapped with `withSafety`. */
  make(mode: UpstreamMode): AvailabilityVerifier;
  clock: Clock;
  venue: Venue;
  unsupportedVenue: Venue;
  /** A slot the "normal" fixture has free for this party size. */
  availableQuery: SlotQuery;
  /** A slot the "normal" fixture shows as taken / not offered. */
  unavailableQuery: SlotQuery;
  /** Expected tier for results. */
  tier: AvailabilityVerifier["tier"];
};

/**
 * Every AvailabilityVerifier adapter must pass this suite (see README "Adding an adapter").
 * Real adapters run it against recorded fixtures — never against live sites in CI.
 */
export function runAvailabilityVerifierContract(name: string, h: () => VerifierHarness) {
  describe(`AvailabilityVerifier contract: ${name}`, () => {
    it("returns AVAILABLE with evidence for a free slot", async () => {
      const t = h();
      const r = await t.make("normal").check(t.venue, t.availableQuery, { purpose: "initial" });
      expect(r.status).toBe("AVAILABLE");
      expect(r.tier).toBe(t.tier);
      expect(r.evidence.source.length).toBeGreaterThan(0);
      expect(r.evidence.checkedAt.getTime()).toBeLessThanOrEqual(t.clock.now().getTime());
      expect(r.matched?.resources.length).toBeGreaterThan(0);
    });

    it("returns UNAVAILABLE with a reason for a taken slot", async () => {
      const t = h();
      const r = await t.make("normal").check(t.venue, t.unavailableQuery, { purpose: "initial" });
      expect(r.status).toBe("UNAVAILABLE");
      expect(r.reason).toBeTruthy();
    });

    it("is never AVAILABLE for an absurd party size", async () => {
      const t = h();
      const r = await t.make("normal").check(t.venue, { ...t.availableQuery, partySize: 400 }, { purpose: "initial" });
      expect(r.status).not.toBe("AVAILABLE");
    });

    it.each(["http_error", "garbage", "hang"] as const)("returns UNKNOWN (never throws) when upstream is %s", async (mode) => {
      const t = h();
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 200);
      const r = await t.make(mode).check(t.venue, t.availableQuery, { purpose: "initial", signal: ctrl.signal });
      expect(r.status).toBe("UNKNOWN");
      expect(r.reason).toBeTruthy();
    }, 15_000);

    it("returns UNKNOWN for a venue it doesn't support", async () => {
      const t = h();
      const v = t.make("normal");
      expect(v.supports(t.unsupportedVenue)).toBe(false);
      const r = await v.check(t.unsupportedVenue, t.availableQuery, { purpose: "initial" });
      expect(r.status).toBe("UNKNOWN");
    });

    it("rejects invalid party sizes as UNKNOWN", async () => {
      const t = h();
      const r = await t.make("normal").check(t.venue, { ...t.availableQuery, partySize: 0 }, { purpose: "initial" });
      expect(r.status).toBe("UNKNOWN");
    });
  });
}
