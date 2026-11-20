import type { SlotQuery, VerificationResult } from "@/domain/availability";
import { unitsNeeded } from "@/domain/availability";
import { londonParts } from "@/domain/london-time";
import type { Venue } from "@/domain/venue";
import type { AvailabilityVerifier, CheckOptions, Clock } from "@/ports";

/**
 * Deterministic verifier for tests and the demo. Behaviour per venue via bookingRef.mockScenario:
 *  - "open" (default): free on the hour/half-hour 07:00–22:00, `courts` units (default 4)
 *  - "full": nothing free
 *  - "gone_on_recheck": free on first check, taken on any re-check (lock_in / recheck / bypassCache)
 *  - "flaky": alternates AVAILABLE / UNKNOWN
 *  - "error": throws (exercises withSafety)
 *  - "hang": never resolves until aborted
 */
export class MockVerifier implements AvailabilityVerifier {
  readonly id = "mock";
  readonly tier = "MOCK" as const;
  private calls = new Map<string, number>();

  constructor(private readonly clock: Clock) {}

  supports(venue: Venue): boolean {
    return venue.provider === "mock";
  }

  async check(venue: Venue, q: SlotQuery, opts: CheckOptions): Promise<VerificationResult> {
    const scenario = String(venue.bookingRef.mockScenario ?? "open");
    const key = `${venue.id}|${q.start.toISOString()}|${q.partySize}`;
    const n = (this.calls.get(key) ?? 0) + 1;
    this.calls.set(key, n);
    const base = {
      tier: this.tier,
      verifier: this.id,
      query: q,
      evidence: {
        source: `mock://${venue.externalId}?scenario=${scenario}`,
        checkedAt: this.clock.now(),
        fromCache: false,
        rawPayload: { contentType: "application/json", body: JSON.stringify({ scenario, call: n }) },
      },
    };
    const capacity = Number(venue.bookingRef.courts ?? 4);
    const needed = unitsNeeded(q.activity, q.partySize);
    const { time } = londonParts(q.start);
    const onGrid = /^(0[7-9]|1\d|2[0-2]):(00|30)$/.test(time);

    switch (scenario) {
      case "error":
        throw new Error("mock upstream exploded");
      case "hang":
        return new Promise((_, reject) => opts.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      case "full":
        return { ...base, status: "UNAVAILABLE", reason: "fully booked (mock)" };
      case "flaky":
        if (n % 2 === 0) return { ...base, status: "UNKNOWN", reason: "mock upstream flaked" };
        break;
      case "gone_on_recheck":
        if (opts.purpose !== "initial" || opts.bypassCache) return { ...base, status: "UNAVAILABLE", reason: "taken since last check (mock)" };
        break;
    }
    if (!onGrid) return { ...base, status: "UNAVAILABLE", reason: `no slot at ${time} (mock grid)` };
    if (needed > capacity) return { ...base, status: "UNAVAILABLE", reason: `needs ${needed} units, venue has ${capacity}` };
    return {
      ...base,
      status: "AVAILABLE",
      matched: {
        start: q.start,
        durationMins: q.durationMins,
        resources: Array.from({ length: needed }, (_, i) => ({ id: `${venue.externalId}-${i + 1}`, name: `Unit ${i + 1}` })),
      },
    };
  }
}
