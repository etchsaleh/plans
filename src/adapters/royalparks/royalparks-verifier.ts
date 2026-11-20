import { unitsNeeded, type SlotQuery, type VerificationResult } from "@/domain/availability";
import { londonParts } from "@/domain/london-time";
import type { Venue } from "@/domain/venue";
import type { AvailabilityVerifier, CheckOptions, Clock } from "@/ports";
import { HttpError, type PoliteHttp } from "@/adapters/http/polite-http";
import { parseTimetablePage, TimetableFormatError, type TimetablePage, type TimetableRow } from "./timetable";

/**
 * Royal Parks Sport & Leisure (Hyde Park, Regent's Park, Greenwich) via the public availability
 * timetable. Only bookable slots are listed, 5 rows per page, ordered by time. We gallop + binary
 * search over pages to reach the requested time with a bounded number of requests; PoliteHttp
 * rate-limits (2 s/request) and caches pages ≤ 5 min.
 *
 * Only enabled when ROYALPARKS_PERMISSION_ON_FILE=true (their terms forbid automated access
 * without permission — see docs/adapters/tennis-london.md).
 */
const TITLE: Record<string, RegExp> = { tennis: /^Tennis-\d+min$/i, padel: /^Padel-\d+min$/i };

export type RoyalParksRef = { locationId: string; slug: string };

export function royalParksRef(venue: Venue): RoyalParksRef | null {
  const r = venue.bookingRef;
  return typeof r.locationId === "string" && typeof r.slug === "string" ? { locationId: r.locationId, slug: r.slug } : null;
}

class BudgetExceeded extends Error {}

export class RoyalParksVerifier implements AvailabilityVerifier {
  readonly id = "royalparks";
  readonly tier = "LICENSED" as const;

  constructor(
    private readonly http: PoliteHttp,
    private readonly clock: Clock,
    private readonly opts: { baseUrl?: string; maxRequests?: number } = {},
  ) {}

  supports(venue: Venue): boolean {
    return venue.provider === "royalparks" && royalParksRef(venue) !== null && venue.activity in TITLE;
  }

  async check(venue: Venue, q: SlotQuery, opts: CheckOptions): Promise<VerificationResult> {
    const ref = royalParksRef(venue)!;
    const { date, time } = londonParts(q.start);
    const base = `${this.opts.baseUrl ?? "https://sportsandleisure.royalparks.org.uk"}/availability?location=${ref.locationId}&calendar_date=${date}`;
    const source = `royalparks:${base}`;
    const budget = this.opts.maxRequests ?? 20;
    const fetched = new Map<number, { page: TimetablePage; fetchedAt: Date; fromCache: boolean; body: string }>();
    let oldest: Date | null = null;
    let anyFromCache = false;

    const page = async (n: number) => {
      const hit = fetched.get(n);
      if (hit) return hit.page;
      if (fetched.size >= budget) throw new BudgetExceeded(`more than ${budget} timetable pages needed`);
      const doc = await this.http.get(`${base}&page=${n}`, { signal: opts.signal, bypassCache: opts.bypassCache, accept: "text/html" });
      const p = parseTimetablePage(doc.body);
      fetched.set(n, { page: p, fetchedAt: doc.fetchedAt, fromCache: doc.fromCache, body: doc.body });
      if (!oldest || doc.fetchedAt < oldest) oldest = doc.fetchedAt;
      anyFromCache ||= doc.fromCache;
      return p;
    };
    const last = (p: TimetablePage) => p.rows.at(-1)?.time;
    const first = (p: TimetablePage) => p.rows[0]?.time;
    // A page "reaches" the target when it's empty (past the end) or its last row is at/after it.
    const reaches = (p: TimetablePage) => p.rows.length === 0 || last(p)! >= time;

    const fail = (status: "UNKNOWN", reason: string): VerificationResult => ({
      status, reason, tier: this.tier, verifier: this.id, query: q,
      evidence: { source, checkedAt: oldest ?? this.clock.now(), fromCache: anyFromCache },
    });

    const matches: TimetableRow[] = [];
    const needed = unitsNeeded(q.activity, q.partySize);
    try {
      // 1. gallop to bracket the target time
      let lo = -1;
      let hi = 0;
      let step = 1;
      while (!reaches(await page(hi))) {
        if (!(await page(hi)).hasMore) { hi = hi + 1; break; }
        lo = hi;
        hi = lo + step;
        step *= 2;
      }
      // 2. binary search: first page that reaches the target
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (reaches(await page(mid))) hi = mid;
        else lo = mid;
      }
      // 3. scan forward collecting rows at the target time
      for (let n = hi; ; n++) {
        const p = await page(n);
        if (p.rows.length === 0) break;
        for (const r of p.rows) {
          if (r.date === date && r.time === time && TITLE[q.activity].test(r.title) && r.durationMins === q.durationMins && r.spotsFree > 0) {
            matches.push(r);
          }
        }
        if (matches.length >= needed || first(p)! > time || last(p)! > time || !p.hasMore) break;
      }
    } catch (e) {
      if (e instanceof BudgetExceeded) return fail("UNKNOWN", e.message);
      if (e instanceof TimetableFormatError) return fail("UNKNOWN", `timetable format changed: ${e.message}`);
      if (e instanceof HttpError) return fail("UNKNOWN", `upstream HTTP ${e.status}`);
      return fail("UNKNOWN", `fetch failed: ${(e as Error).message}`);
    }

    const pages = [...fetched.entries()].sort(([a], [b]) => a - b);
    const evidence = {
      source: `${source} (pages ${pages.map(([n]) => n).join(",")})`,
      checkedAt: oldest ?? this.clock.now(),
      fromCache: anyFromCache,
      rawPayload: {
        contentType: "application/json",
        body: JSON.stringify(pages.map(([n, p]) => ({ page: n, fetchedAt: p.fetchedAt, rows: p.page.rows }))),
      },
    };
    const base2 = { tier: this.tier, verifier: this.id, query: q, evidence };
    if (matches.length < needed) {
      return {
        ...base2,
        status: "UNAVAILABLE",
        reason: matches.length === 0
          ? `no ${q.activity} court free at ${time} for ${q.durationMins} min`
          : `only ${matches.length} of ${needed} courts free at ${time}`,
      };
    }
    const chosen = matches.slice(0, needed);
    return {
      ...base2,
      status: "AVAILABLE",
      matched: {
        start: q.start,
        durationMins: q.durationMins,
        resources: chosen.map((r) => ({ id: r.location, name: r.location.split(",")[0] })),
      },
    };
  }
}

/** Where to send a human to book. Per their terms we link to the site; the slot URL is shown as text. */
export function royalParksBookingUrl(): string {
  return "https://sportsandleisure.royalparks.org.uk/";
}
