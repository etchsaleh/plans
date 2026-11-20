import type { AvailabilitySnapshot, SlotQuery, VerificationResult } from "@/domain/availability";
import type { Venue } from "@/domain/venue";
import type { CheckPurpose, CheckTier } from "@/domain/vocabulary";

export type CheckOptions = {
  purpose: CheckPurpose;
  signal?: AbortSignal;
  /** Re-checks (lock-in, stale view) must hit the source, not a cache. */
  bypassCache?: boolean;
};

/**
 * Port: "is THIS slot free for THIS party size?"
 * Contract (src/contracts/availability-verifier.contract.ts):
 *  - never throws for upstream problems → UNKNOWN with a reason
 *  - UNAVAILABLE/UNKNOWN always carry a reason
 *  - evidence.checkedAt is when the source was read (not when a cache served it)
 */
export interface AvailabilityVerifier {
  readonly id: string;
  readonly tier: CheckTier;
  supports(venue: Venue): boolean;
  check(venue: Venue, query: SlotQuery, opts: CheckOptions): Promise<VerificationResult>;
}

/** Append-only audit log of every check. */
export interface SnapshotStore {
  append(snapshot: AvailabilitySnapshot): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
