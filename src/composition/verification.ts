import type { Env } from "@/lib/env";
import type { Logger } from "@/lib/logger";
import type { AvailabilityVerifier, Clock, SnapshotStore } from "@/ports";
import { PoliteHttp } from "@/adapters/http/polite-http";
import { MockVerifier } from "@/adapters/mock/mock-verifier";
import { PlaytomicVerifier } from "@/adapters/playtomic/playtomic-verifier";
import { RoyalParksVerifier } from "@/adapters/royalparks/royalparks-verifier";
import { withAudit, withSafety } from "@/adapters/verifier-decorators";
import { VerifierRegistry } from "@/adapters/verifier-registry";

export type VerificationDeps = { env: Env; clock: Clock; logger: Logger; store: SnapshotStore };

/**
 * Builds the verifier chain: registry → per-source verifier → safety guard, all audited.
 * Real sources are only enabled when listed in VERIFIERS **and** permission is recorded.
 */
export function buildVerification(deps: VerificationDeps): { verifier: AvailabilityVerifier; enabled: string[]; skipped: string[] } {
  const { env, clock, logger, store } = deps;
  const wanted = new Set(env.VERIFIERS.split(",").map((s) => s.trim()).filter(Boolean));
  const http = new PoliteHttp({ clock, minIntervalMs: 2000, ttlMs: 3 * 60_000, timeoutMs: 8000 });
  const chain: AvailabilityVerifier[] = [];
  const skipped: string[] = [];

  if (wanted.has("mock")) chain.push(new MockVerifier(clock));
  if (wanted.has("playtomic")) {
    if (env.PLAYTOMIC_PERMISSION_ON_FILE) chain.push(new PlaytomicVerifier(http, clock, { bstVerified: env.PLAYTOMIC_BST_VERIFIED }));
    else skipped.push("playtomic (PLAYTOMIC_PERMISSION_ON_FILE is not true)");
  }
  if (wanted.has("royalparks")) {
    if (env.ROYALPARKS_PERMISSION_ON_FILE) chain.push(new RoyalParksVerifier(http, clock));
    else skipped.push("royalparks (ROYALPARKS_PERMISSION_ON_FILE is not true)");
  }

  // Interactive checks should answer fast; Royal Parks may need several 2 s-spaced pages on a cold cache.
  const safe = chain.map((v) => withSafety(v, clock, v.id === "royalparks" ? 45_000 : 10_000));
  const registry = new VerifierRegistry(safe, clock);
  for (const s of skipped) logger.warn({ verifier: s }, "verifier requested but not enabled");
  return { verifier: withAudit(registry, { store, clock, logger }), enabled: registry.enabled(), skipped };
}
