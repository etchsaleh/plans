import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAvailabilityVerifierContract, type UpstreamMode } from "@/contracts/availability-verifier.contract";
import type { Venue } from "@/domain/venue";
import { PoliteHttp, type FetchLike } from "@/adapters/http/polite-http";
import { withSafety } from "@/adapters/verifier-decorators";
import { RoyalParksVerifier } from "./royalparks-verifier";
import { parseTimetablePage } from "./timetable";

const dir = path.join(__dirname, "__fixtures__/hyde-park-2026-11-21");
const pageHtml = (n: number) => {
  const f = path.join(dir, `page-${n}.html`);
  return existsSync(f) ? readFileSync(f, "utf8") : "<main><p>No results</p></main>";
};
const clock = { now: () => new Date("2026-11-20T16:00:00Z") };

const venue: Venue = {
  id: "v-hyde", provider: "royalparks", externalId: "hyde-park-courts", name: "Hyde Park Courts",
  activity: "tennis", area: "Hyde Park", tags: [], bookingRef: { locationId: "102", slug: "hyde-park-courts" },
};
const at = (hhmm: string, partySize = 2, durationMins = 60) => ({
  venueId: venue.id, activity: "tennis" as const, start: new Date(`2026-11-21T${hhmm}:00Z`), durationMins, partySize,
});

function transport(mode: UpstreamMode, seen: number[] = []): FetchLike {
  return async (url, init) => {
    const n = Number(new URL(url).searchParams.get("page"));
    seen.push(n);
    switch (mode) {
      case "normal": return new Response(pageHtml(n), { headers: { "content-type": "text/html" } });
      case "http_error": return new Response("err", { status: 503 });
      case "garbage": return new Response("<table><tbody><tr><td>x</td><td>y</td><td>z</td><td>q</td><td>w</td><td>e</td><td>r</td></tr></tbody></table>");
      case "hang": return new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    }
  };
}
const make = (mode: UpstreamMode, seen?: number[]) =>
  withSafety(new RoyalParksVerifier(new PoliteHttp({ fetch: transport(mode, seen), clock, sleep: async () => {} }), clock), clock, 5000);

describe("parseTimetablePage", () => {
  it("parses a recorded page", () => {
    const p = parseTimetablePage(pageHtml(0));
    expect(p.hasMore).toBe(true);
    expect(p.rows).toHaveLength(5);
    expect(p.rows[0]).toMatchObject({ time: "07:00", date: "2026-11-21", durationMins: 60, spotsFree: 1, spotsTotal: 1 });
  });
  it("treats a page with no table as the end", () => {
    expect(parseTimetablePage("<main>No results</main>")).toEqual({ rows: [], hasMore: false });
  });
});

runAvailabilityVerifierContract("royalparks (recorded timetable)", () => ({
  clock, tier: "LICENSED", venue,
  unsupportedVenue: { ...venue, provider: "playtomic" },
  availableQuery: at("17:00"),
  unavailableQuery: at("16:30"),
  make: (mode) => make(mode),
}));

describe("RoyalParksVerifier", () => {
  it("finds 17:00 tennis within a bounded number of page requests", async () => {
    const seen: number[] = [];
    const r = await make("normal", seen).check(venue, at("17:00"), { purpose: "initial" });
    expect(r.status).toBe("AVAILABLE");
    expect(r.matched?.resources[0].name).toMatch(/Court/);
    expect(new Set(seen).size).toBeLessThanOrEqual(16);
  });

  it("allocates courts for bigger groups and explains shortfalls", async () => {
    const two = await make("normal").check(venue, at("17:00", 8), { purpose: "initial" });
    expect(two.status).toBe("AVAILABLE");
    expect(two.matched?.resources).toHaveLength(2);
    const three = await make("normal").check(venue, at("17:00", 12), { purpose: "initial" });
    expect(three).toMatchObject({ status: "UNAVAILABLE", reason: "only 2 of 3 courts free at 17:00" });
  });

  it("stops scanning as soon as enough courts are found (07:00 tennis starts on page 3)", async () => {
    const seen: number[] = [];
    const r = await make("normal", seen).check(venue, at("07:00"), { purpose: "initial" });
    expect(r.status).toBe("AVAILABLE");
    expect(seen).toEqual([0, 1, 2, 3]);
  });

  it("reports times after the end of the timetable as unavailable", async () => {
    const r = await make("normal").check(venue, at("20:00"), { purpose: "initial" });
    expect(r.status).toBe("UNAVAILABLE");
  });

  it("re-uses cached pages across checks (polite)", async () => {
    const seen: number[] = [];
    const http = new PoliteHttp({ fetch: transport("normal", seen), clock, sleep: async () => {} });
    const v = new RoyalParksVerifier(http, clock);
    await v.check(venue, at("17:00"), { purpose: "initial" });
    const first = seen.length;
    const r = await v.check(venue, at("17:00", 4), { purpose: "initial" });
    expect(seen.length).toBe(first);
    expect(r.evidence.fromCache).toBe(true);
  });

  it("gives up with UNKNOWN when the page budget is exhausted", async () => {
    const http = new PoliteHttp({ fetch: transport("normal"), clock, sleep: async () => {} });
    const r = await new RoyalParksVerifier(http, clock, { maxRequests: 3 }).check(venue, at("17:00"), { purpose: "initial" });
    expect(r).toMatchObject({ status: "UNKNOWN" });
    expect(r.reason).toMatch(/pages needed/);
  });
});
