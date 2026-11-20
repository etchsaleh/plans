import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAvailabilityVerifierContract, type UpstreamMode } from "@/contracts/availability-verifier.contract";
import type { Venue } from "@/domain/venue";
import { PoliteHttp, type FetchLike } from "@/adapters/http/polite-http";
import { withSafety } from "@/adapters/verifier-decorators";
import { PlaytomicVerifier } from "./playtomic-verifier";

const fixture = readFileSync(path.join(__dirname, "__fixtures__/availability_battersea_2026-11-21.json"), "utf8");
const clock = { now: () => new Date("2026-11-21T10:00:00Z") };

const venue: Venue = {
  id: "v-bpma", provider: "playtomic", externalId: "0e86011b-7857-4bc9-b594-9334047316a4",
  name: "Battersea Park Millennium Arena", activity: "padel", area: "Battersea", tags: [],
  bookingRef: { tenantId: "0e86011b-7857-4bc9-b594-9334047316a4", slug: "battersea-park-millennium-arena", sportId: "PADEL" },
};
const at = (iso: string, partySize = 4, durationMins = 60) => ({
  venueId: venue.id, activity: "padel" as const, start: new Date(iso), durationMins, partySize,
});

function transport(mode: UpstreamMode, seen: string[] = []): FetchLike {
  return async (url, init) => {
    seen.push(url);
    switch (mode) {
      case "normal": return new Response(fixture, { headers: { "content-type": "application/json" } });
      case "http_error": return new Response("err", { status: 500 });
      case "garbage": return new Response("<html>not json</html>");
      case "hang":
        return new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    }
  };
}
const make = (mode: UpstreamMode, seen?: string[], opts?: { bstVerified?: boolean }) =>
  withSafety(new PlaytomicVerifier(new PoliteHttp({ fetch: transport(mode, seen), clock, sleep: async () => {} }), clock, opts), clock, 3000);

runAvailabilityVerifierContract("playtomic (recorded shape)", () => ({
  clock, tier: "LICENSED", venue,
  unsupportedVenue: { ...venue, provider: "mock" },
  availableQuery: at("2026-11-21T18:00:00Z"),
  unavailableQuery: at("2026-11-21T19:00:00Z"),
  make: (mode) => make(mode),
}));

describe("PlaytomicVerifier", () => {
  it("requests one document per club/date/sport with the London date", async () => {
    const seen: string[] = [];
    await make("normal", seen).check(venue, at("2026-11-21T18:00:00Z"), { purpose: "initial" });
    expect(seen).toEqual([
      "https://playtomic.com/api/clubs/availability?tenant_id=0e86011b-7857-4bc9-b594-9334047316a4&date=2026-11-21&sport_id=PADEL",
    ]);
  });

  it("books two courts for 8 players when two are free at that time", async () => {
    const r = await make("normal").check(venue, at("2026-11-21T18:00:00Z", 8), { purpose: "initial" });
    expect(r.status).toBe("AVAILABLE");
    expect(r.matched?.resources.map((x) => x.id)).toEqual([
      "32307b25-b98f-4ef0-bfb5-c379375d2c4e",
      "016123a4-aee0-4c5e-95ef-2a609e810803",
    ]);
    expect(r.matched?.priceText).toBe("52 GBP + 52 GBP");
  });

  it("explains partial availability", async () => {
    const r = await make("normal").check(venue, at("2026-11-21T21:00:00Z", 8), { purpose: "initial" });
    expect(r).toMatchObject({ status: "UNAVAILABLE", reason: "only 1 of 2 courts free at 21:00" });
  });

  it("matches duration exactly (90-min slot isn't a 60-min slot)", async () => {
    const r = await make("normal").check(venue, at("2026-11-21T16:30:00Z", 4, 60), { purpose: "initial" });
    expect(r.status).toBe("UNAVAILABLE");
    const r90 = await make("normal").check(venue, at("2026-11-21T16:30:00Z", 4, 90), { purpose: "initial" });
    expect(r90.status).toBe("AVAILABLE");
  });

  it("keeps the raw payload for the audit log", async () => {
    const r = await make("normal").check(venue, at("2026-11-21T18:00:00Z"), { purpose: "initial" });
    expect(r.evidence.rawPayload?.body).toBe(fixture);
  });

  it("refuses to guess during BST until time zone semantics are verified", async () => {
    const summer = at("2026-07-01T17:00:00Z");
    expect((await make("normal").check(venue, summer, { purpose: "initial" })).status).toBe("UNKNOWN");
  });
});
