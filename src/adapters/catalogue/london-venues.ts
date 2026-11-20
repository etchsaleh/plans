import { v5 as uuidv5 } from "uuid";
import type { Venue } from "@/domain/venue";

/** Stable ids so the catalogue can be re-seeded idempotently. */
const NS = "6f1c1f3e-4b2a-4d55-9c39-0b8f5a1e2d10";
const id = (provider: string, externalId: string) => uuidv5(`${provider}:${externalId}`, NS);

type Seed = Omit<Venue, "id">;

/**
 * Hand-curated London venues with live verifiers. Identifiers were taken from the public
 * pages on 2026-11-20 (Playtomic tenant id from the club page; Royal Parks location ids
 * from the availability timetable filter).
 */
const seeds: Seed[] = [
  {
    provider: "playtomic", externalId: "0e86011b-7857-4bc9-b594-9334047316a4:PADEL",
    name: "Battersea Park Millennium Arena", activity: "padel", area: "Battersea", priceBand: "££", tags: ["outdoor", "floodlit"],
    bookingRef: { tenantId: "0e86011b-7857-4bc9-b594-9334047316a4", slug: "battersea-park-millennium-arena", sportId: "PADEL" },
  },
  ...(
    [
      ["102", "hyde-park-courts", "Hyde Park Courts", "Hyde Park"],
      ["104", "the-regents-park-courts", "The Regent's Park Courts", "Regent's Park"],
      ["105", "greenwich-park-courts", "Greenwich Park Courts", "Greenwich"],
    ] as const
  ).flatMap(([locationId, slug, name, area]) =>
    (["tennis", "padel"] as const)
      .filter((a) => !(a === "padel" && slug === "greenwich-park-courts"))
      .map<Seed>((activity) => ({
        provider: "royalparks", externalId: `${slug}:${activity}`, name, activity, area, priceBand: "£",
        tags: ["outdoor", "park"], bookingRef: { locationId, slug },
      })),
  ),
  // Demo venues for the MockVerifier.
  ...(
    [
      ["demo-padel-open", "Demo Padel Club", "padel", "Battersea", "open"],
      ["demo-padel-gone", "Demo Padel (goes on re-check)", "padel", "Clapham", "gone_on_recheck"],
      ["demo-tennis-open", "Demo Tennis Courts", "tennis", "Hyde Park", "open"],
      ["demo-dinner-open", "Demo Bistro", "restaurant", "Soho", "open"],
    ] as const
  ).map<Seed>(([externalId, name, activity, area, mockScenario]) => ({
    provider: "mock", externalId, name, activity, area, priceBand: "££", tags: ["demo"], bookingRef: { mockScenario },
  })),
];

export const LONDON_VENUES: Venue[] = seeds.map((s) => ({ ...s, id: id(s.provider, s.externalId) }));

/** Short handles for the CLI, e.g. "hyde-tennis", "battersea-padel". */
export function venueHandle(v: Venue): string {
  if (v.provider === "playtomic") return `${String(v.bookingRef.slug).split("-")[0]}-${v.activity}`;
  if (v.provider === "royalparks") return `${String(v.bookingRef.slug).replace(/^the-/, "").split("-")[0]}-${v.activity}`;
  return v.externalId;
}
