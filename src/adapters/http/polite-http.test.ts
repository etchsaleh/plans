import { describe, expect, it, vi } from "vitest";
import { HttpError, PoliteHttp, type FetchLike } from "./polite-http";

function fakeClock(start = 0) {
  let t = start;
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
}

describe("PoliteHttp", () => {
  it("caches successful responses and keeps the original fetchedAt", async () => {
    const clock = fakeClock(1_000_000);
    const fetch = vi.fn(async () => new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }));
    const http = new PoliteHttp({ fetch, clock, ttlMs: 60_000, sleep: async () => {} });
    const a = await http.get("https://x.test/a");
    clock.advance(30_000);
    const b = await http.get("https://x.test/a");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(b.fromCache).toBe(true);
    expect(b.fetchedAt).toEqual(a.fetchedAt);
  });

  it("refetches after TTL and when bypassCache is set", async () => {
    const clock = fakeClock();
    const fetch = vi.fn(async () => new Response("ok"));
    const http = new PoliteHttp({ fetch, clock, ttlMs: 60_000, sleep: async () => {} });
    await http.get("https://x.test/a");
    await http.get("https://x.test/a", { bypassCache: true });
    clock.advance(61_000);
    await http.get("https://x.test/a");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("never caches longer than 5 minutes even if asked to", async () => {
    const clock = fakeClock();
    const fetch = vi.fn(async () => new Response("ok"));
    const http = new PoliteHttp({ fetch, clock, ttlMs: 60 * 60_000, sleep: async () => {} });
    await http.get("https://x.test/a");
    clock.advance(5 * 60_000 + 1);
    await http.get("https://x.test/a");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("spaces requests to the same host by minIntervalMs", async () => {
    const clock = fakeClock();
    const sleeps: number[] = [];
    const http = new PoliteHttp({
      fetch: async () => new Response("ok"),
      clock,
      minIntervalMs: 2000,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock.advance(ms);
      },
    });
    await Promise.all([http.get("https://x.test/1"), http.get("https://x.test/2"), http.get("https://y.test/1")]);
    expect(sleeps).toEqual([2000]);
  });

  it("sends an honest User-Agent and no spoofed origin", async () => {
    const fetch = vi.fn<FetchLike>(async () => new Response("ok"));
    await new PoliteHttp({ fetch, sleep: async () => {} }).get("https://x.test/a");
    const headers = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["user-agent"]).toMatch(/PlanAvailabilityBot/);
    expect(Object.keys(headers)).not.toContain("origin");
  });

  it("throws HttpError on non-2xx and doesn't cache it", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 503 }));
    const http = new PoliteHttp({ fetch, sleep: async () => {} });
    await expect(http.get("https://x.test/a")).rejects.toBeInstanceOf(HttpError);
    await expect(http.get("https://x.test/a")).rejects.toBeInstanceOf(HttpError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
