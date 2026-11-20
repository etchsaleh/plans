import { unknown, type SlotQuery, type VerificationResult } from "@/domain/availability";
import type { Venue } from "@/domain/venue";
import type { AvailabilityVerifier, CheckOptions, Clock } from "@/ports";

/** Routes each venue to the first enabled verifier that supports it; otherwise UNKNOWN. */
export class VerifierRegistry implements AvailabilityVerifier {
  readonly id = "registry";
  readonly tier = "NONE" as const;
  constructor(private readonly verifiers: AvailabilityVerifier[], private readonly clock: Clock) {}

  enabled(): string[] {
    return this.verifiers.map((v) => v.id);
  }
  supports(venue: Venue): boolean {
    return this.verifiers.some((v) => v.supports(venue));
  }
  check(venue: Venue, q: SlotQuery, opts: CheckOptions): Promise<VerificationResult> {
    const v = this.verifiers.find((x) => x.supports(venue));
    if (!v) {
      return Promise.resolve(
        unknown("none", "NONE", q, `no enabled verifier for ${venue.provider} (link only)`, `${venue.provider}:link-only`, this.clock.now()),
      );
    }
    return v.check(venue, q, opts);
  }
}
