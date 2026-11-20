import type { Clock } from "@/ports";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpDocument = {
  url: string;
  status: number;
  contentType: string;
  body: string;
  /** When the source was actually read. Preserved for cache hits. */
  fetchedAt: Date;
  fromCache: boolean;
};

export type PoliteHttpOptions = {
  fetch?: FetchLike;
  clock?: Clock;
  userAgent?: string;
  /** Minimum gap between requests to the same host. */
  minIntervalMs?: number;
  /** Cache lifetime for successful responses. Capped at 5 minutes by policy. */
  ttlMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

const MAX_TTL_MS = 5 * 60 * 1000;

/**
 * The only way adapters talk to the outside world:
 *  - one request at a time per host, at least `minIntervalMs` apart (aggressive rate limit)
 *  - successful responses cached ≤ 5 min; cache keeps the original fetchedAt
 *  - identifies itself honestly via User-Agent; no header spoofing
 *  - timeouts + caller abort signals
 */
export class PoliteHttp {
  private readonly fetchImpl: FetchLike;
  private readonly clock: Clock;
  private readonly ua: string;
  private readonly minInterval: number;
  private readonly ttl: number;
  private readonly timeout: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly cache = new Map<string, HttpDocument>();
  private readonly inflight = new Map<string, Promise<HttpDocument>>();
  private readonly hostQueue = new Map<string, Promise<unknown>>();
  private readonly lastRequestAt = new Map<string, number>();

  constructor(opts: PoliteHttpOptions = {}) {
    this.fetchImpl = opts.fetch ?? ((i, init) => fetch(i, init));
    this.clock = opts.clock ?? { now: () => new Date() };
    this.ua = opts.userAgent ?? "PlanAvailabilityBot/0.1 (+https://github.com/etchsaleh/plans)";
    this.minInterval = opts.minIntervalMs ?? 2000;
    this.ttl = Math.min(opts.ttlMs ?? 3 * 60 * 1000, MAX_TTL_MS);
    this.timeout = opts.timeoutMs ?? 8000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async get(url: string, opts: { signal?: AbortSignal; bypassCache?: boolean; accept?: string } = {}): Promise<HttpDocument> {
    const now = this.clock.now().getTime();
    const hit = this.cache.get(url);
    if (!opts.bypassCache && hit && now - hit.fetchedAt.getTime() <= this.ttl) {
      return { ...hit, fromCache: true };
    }
    const existing = this.inflight.get(url);
    if (existing && !opts.bypassCache) return existing;

    const p = this.enqueue(new URL(url).host, () => this.doFetch(url, opts)).finally(() => this.inflight.delete(url));
    this.inflight.set(url, p);
    return p;
  }

  private enqueue<T>(host: string, task: () => Promise<T>): Promise<T> {
    const prev = this.hostQueue.get(host) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(async () => {
      const last = this.lastRequestAt.get(host);
      if (last !== undefined) {
        const wait = last + this.minInterval - this.clock.now().getTime();
        if (wait > 0) await this.sleep(wait);
      }
      this.lastRequestAt.set(host, this.clock.now().getTime());
      return task();
    });
    this.hostQueue.set(host, run);
    return run;
  }

  private async doFetch(url: string, opts: { signal?: AbortSignal; accept?: string }): Promise<HttpDocument> {
    const timeout = AbortSignal.timeout(this.timeout);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    const res = await this.fetchImpl(url, {
      signal,
      headers: { "user-agent": this.ua, accept: opts.accept ?? "*/*" },
      redirect: "follow",
    });
    const body = await res.text();
    if (!res.ok) throw new HttpError(res.status, url);
    const doc: HttpDocument = {
      url,
      status: res.status,
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      body,
      fetchedAt: this.clock.now(),
      fromCache: false,
    };
    this.cache.set(url, doc);
    return doc;
  }
}
