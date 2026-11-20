import { z } from "zod";
import { unitsNeeded, type SlotQuery, type VerificationResult } from "@/domain/availability";
import { isBritishSummerTime, londonParts } from "@/domain/london-time";
import type { Venue } from "@/domain/venue";
import type { AvailabilityVerifier, CheckOptions, Clock } from "@/ports";
import { HttpError, type PoliteHttp } from "@/adapters/http/polite-http";

/**
 * Reads the same per-club availability document playtomic.com's public club page loads
 * (observed 2026-11-20, see docs/adapters/playtomic.md). One request per club+date+sport,
 * cached ≤ 5 min by PoliteHttp. Only enabled when PLAYTOMIC_PERMISSION_ON_FILE=true.
 *
 * Response: [{ resource_id, start_date, slots: [{ start_time "HH:MM:SS", duration mins, price "52 GBP" }] }]
 * Each listed slot is a free start time on that court.
 */
const responseSchema = z.array(
  z.object({
    resource_id: z.string(),
    start_date: z.string(),
    slots: z.array(z.object({ start_time: z.string(), duration: z.number(), price: z.string().optional() })),
  }),
);

export type PlaytomicRef = { tenantId: string; slug: string; sportId: "PADEL" | "TENNIS" };

export function playtomicRef(venue: Venue): PlaytomicRef | null {
  const r = venue.bookingRef;
  if (typeof r.tenantId !== "string" || typeof r.slug !== "string") return null;
  const sportId = r.sportId === "TENNIS" ? "TENNIS" : "PADEL";
  return { tenantId: r.tenantId, slug: r.slug, sportId };
}

export class PlaytomicVerifier implements AvailabilityVerifier {
  readonly id = "playtomic";
  readonly tier = "LICENSED" as const;

  constructor(
    private readonly http: PoliteHttp,
    private readonly clock: Clock,
    private readonly opts: { baseUrl?: string; bstVerified?: boolean } = {},
  ) {}

  supports(venue: Venue): boolean {
    return venue.provider === "playtomic" && playtomicRef(venue) !== null;
  }

  async check(venue: Venue, q: SlotQuery, opts: CheckOptions): Promise<VerificationResult> {
    const ref = playtomicRef(venue)!;
    const { date, time } = londonParts(q.start);
    const url = `${this.opts.baseUrl ?? "https://playtomic.com"}/api/clubs/availability?tenant_id=${encodeURIComponent(
      ref.tenantId,
    )}&date=${date}&sport_id=${ref.sportId}`;
    const base = { tier: this.tier, verifier: this.id, query: q };
    const unknown = (reason: string, checkedAt = this.clock.now()): VerificationResult => ({
      ...base,
      status: "UNKNOWN",
      reason,
      evidence: { source: `playtomic:${url}`, checkedAt, fromCache: false },
    });

    // Slot times appear to be London local (matched the page in GMT). Until confirmed in BST, don't guess.
    if (isBritishSummerTime(q.start) && !this.opts.bstVerified) {
      return unknown("Playtomic slot time zone not yet verified during British Summer Time");
    }

    let doc;
    try {
      doc = await this.http.get(url, { signal: opts.signal, bypassCache: opts.bypassCache, accept: "application/json" });
    } catch (e) {
      return unknown(e instanceof HttpError ? `upstream HTTP ${e.status}` : `fetch failed: ${(e as Error).message}`);
    }
    const evidence = {
      source: `playtomic:${url}`,
      checkedAt: doc.fetchedAt,
      fromCache: doc.fromCache,
      rawPayload: { contentType: doc.contentType, body: doc.body },
    };
    let parsed;
    try {
      parsed = responseSchema.parse(JSON.parse(doc.body));
    } catch {
      return { ...base, status: "UNKNOWN", reason: "unexpected response format", evidence };
    }

    const wantTime = `${time}:00`;
    const free = parsed.flatMap((court) =>
      court.start_date === date
        ? court.slots
            .filter((s) => s.start_time === wantTime && s.duration === q.durationMins)
            .map((s) => ({ id: court.resource_id, priceText: s.price }))
        : [],
    );
    const needed = unitsNeeded(q.activity, q.partySize);
    if (free.length < needed) {
      return {
        ...base,
        status: "UNAVAILABLE",
        reason:
          free.length === 0
            ? `no court free at ${time} for ${q.durationMins} min`
            : `only ${free.length} of ${needed} courts free at ${time}`,
        evidence,
      };
    }
    const chosen = free.slice(0, needed);
    return {
      ...base,
      status: "AVAILABLE",
      evidence,
      matched: {
        start: q.start,
        durationMins: q.durationMins,
        resources: chosen.map((c) => ({ id: c.id })),
        priceText: chosen.map((c) => c.priceText).filter(Boolean).join(" + ") || undefined,
      },
    };
  }
}
