import { v7 as uuid } from "uuid";
import { unknown, type SlotQuery, type VerificationResult } from "@/domain/availability";
import type { Venue } from "@/domain/venue";
import type { AvailabilityVerifier, CheckOptions, Clock, SnapshotStore } from "@/ports";
import type { Logger } from "@/lib/logger";

/**
 * Guarantees the port contract regardless of adapter bugs:
 * never throws, enforces a timeout, refuses unsupported venues, demands reasons.
 */
export function withSafety(inner: AvailabilityVerifier, clock: Clock, timeoutMs = 10_000): AvailabilityVerifier {
  return {
    id: inner.id,
    tier: inner.tier,
    supports: (v) => inner.supports(v),
    async check(venue: Venue, q: SlotQuery, opts: CheckOptions): Promise<VerificationResult> {
      const fail = (reason: string) => unknown(inner.id, inner.tier, q, reason, `${inner.id}:guard`, clock.now());
      if (!inner.supports(venue)) return fail(`verifier ${inner.id} does not support venue ${venue.provider}:${venue.externalId}`);
      if (!Number.isInteger(q.partySize) || q.partySize < 1) return fail("invalid party size");
      const ctrl = new AbortController();
      const signal = opts.signal ? AbortSignal.any([opts.signal, ctrl.signal]) : ctrl.signal;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<VerificationResult>((resolve) => {
        timer = setTimeout(() => {
          ctrl.abort();
          resolve(fail(`timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      try {
        const r = await Promise.race([inner.check(venue, q, { ...opts, signal }), timeout]);
        if (r.status !== "AVAILABLE" && !r.reason) return { ...r, reason: "no reason given by verifier" };
        if (r.evidence.checkedAt.getTime() > clock.now().getTime() + 1000) return fail("evidence timestamp in the future");
        return r;
      } catch (e) {
        return fail(`error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Writes every check (incl. cache hits and UNKNOWNs) to the append-only log, and logs it. */
export function withAudit(
  inner: AvailabilityVerifier,
  deps: { store: SnapshotStore; clock: Clock; logger?: Pick<Logger, "info" | "warn"> },
  ctx: { candidateId?: string; planId?: string } = {},
): AvailabilityVerifier {
  return {
    id: inner.id,
    tier: inner.tier,
    supports: (v) => inner.supports(v),
    async check(venue, q, opts) {
      const started = deps.clock.now().getTime();
      const r = await inner.check(venue, q, opts);
      const snapshot = { ...r, id: uuid(), purpose: opts.purpose, latencyMs: deps.clock.now().getTime() - started, ...ctx, ...opts.context };
      deps.logger?.info(
        {
          event: "availability.checked",
          snapshotId: snapshot.id,
          verifier: r.verifier,
          tier: r.tier,
          venue: `${venue.provider}:${venue.externalId}`,
          slot: q.start.toISOString(),
          partySize: q.partySize,
          status: r.status,
          reason: r.reason,
          source: r.evidence.source,
          checkedAt: r.evidence.checkedAt.toISOString(),
          fromCache: r.evidence.fromCache,
          purpose: opts.purpose,
        },
        "availability check",
      );
      try {
        await deps.store.append(snapshot);
      } catch (e) {
        // An unaudited result must not be shown as bookable.
        deps.logger?.warn({ err: e, snapshotId: snapshot.id }, "failed to persist availability snapshot");
        return { ...r, status: "UNKNOWN", reason: "audit log write failed" };
      }
      return { ...r, snapshotId: snapshot.id };
    },
  };
}
