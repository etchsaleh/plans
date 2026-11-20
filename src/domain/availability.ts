import type { Activity, AvailabilityStatus, CheckPurpose, CheckTier } from "./vocabulary";

/** "Is THIS slot free for THIS many people?" — the question every verifier answers. */
export type SlotQuery = {
  venueId: string;
  activity: Activity;
  start: Date;
  durationMins: number;
  partySize: number;
};

export type Evidence = {
  /** verifier id + endpoint/page identifier, e.g. "playtomic:/api/clubs/availability?tenant_id=…&date=…" */
  source: string;
  /** When the SOURCE was read. A cached copy keeps the original time — caches never make data look fresher. */
  checkedAt: Date;
  fromCache: boolean;
  /** Raw upstream payload, persisted separately for audit (verification_payloads). */
  rawPayload?: { contentType: string; body: string };
  checkedByParticipantId?: string;
};

export type MatchedSlot = {
  start: Date;
  durationMins: number;
  /** Courts/tables that make up the booking, e.g. two padel courts for 8 people. */
  resources: { id: string; name?: string }[];
  priceText?: string;
};

export type VerificationResult = {
  status: AvailabilityStatus;
  tier: CheckTier;
  verifier: string;
  query: SlotQuery;
  evidence: Evidence;
  matched?: MatchedSlot;
  /** Required for UNAVAILABLE and UNKNOWN. */
  reason?: string;
  /** Set by the audit decorator: id of the persisted snapshot backing this result. */
  snapshotId?: string;
};

export type AvailabilitySnapshot = VerificationResult & {
  id: string;
  purpose: CheckPurpose;
  latencyMs?: number;
  candidateId?: string;
  planId?: string;
  requestId?: string;
};

/** Nothing older than this is presented as bookable without a re-check. */
export const FRESHNESS_MS = 15 * 60 * 1000;

/** Minimum notice before a slot starts for it to be worth offering. */
export function minLeadMs(activity: Activity): number {
  return activity === "restaurant" ? 30 * 60 * 1000 : 45 * 60 * 1000;
}

export function ageMs(r: Pick<VerificationResult, "evidence">, now: Date): number {
  return now.getTime() - r.evidence.checkedAt.getTime();
}

export function isFresh(r: Pick<VerificationResult, "evidence">, now: Date): boolean {
  const age = ageMs(r, now);
  return age >= 0 && age <= FRESHNESS_MS;
}

/**
 * The single rule that decides whether something may be shown as bookable.
 * UNKNOWN and link-only (tier NONE) are never bookable; stale results need a re-check.
 */
export function isBookable(r: VerificationResult, now: Date): boolean {
  return (
    r.status === "AVAILABLE" &&
    r.tier !== "NONE" &&
    isFresh(r, now) &&
    r.query.start.getTime() - now.getTime() >= minLeadMs(r.query.activity)
  );
}

export type Freshness =
  | { kind: "bookable"; ageMins: number }
  | { kind: "stale"; ageMins: number }
  | { kind: "unavailable" }
  | { kind: "unknown"; reason: string }
  | { kind: "too_late" };

/** UI-facing classification, so every surface words freshness the same way. */
export function classify(r: VerificationResult, now: Date): Freshness {
  const ageMins = Math.max(0, Math.floor(ageMs(r, now) / 60000));
  if (r.status === "UNAVAILABLE") return { kind: "unavailable" };
  if (r.status === "UNKNOWN" || r.tier === "NONE") return { kind: "unknown", reason: r.reason ?? "not checkable" };
  if (r.query.start.getTime() - now.getTime() < minLeadMs(r.query.activity)) return { kind: "too_late" };
  return isFresh(r, now) ? { kind: "bookable", ageMins } : { kind: "stale", ageMins };
}

/** Courts hold up to 4 players; tables are a single booking. */
export function unitsNeeded(activity: Activity, partySize: number): number {
  if (partySize < 1) throw new RangeError("partySize must be ≥ 1");
  return activity === "restaurant" ? 1 : Math.ceil(partySize / 4);
}

export function unknown(
  verifier: string,
  tier: VerificationResult["tier"],
  query: SlotQuery,
  reason: string,
  source: string,
  checkedAt: Date,
): VerificationResult {
  return { status: "UNKNOWN", tier, verifier, query, reason, evidence: { source, checkedAt, fromCache: false } };
}
