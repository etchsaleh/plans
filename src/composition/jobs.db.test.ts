import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PgBoss } from "pg-boss";
import { v7 as uuid } from "uuid";
import { LONDON_VENUES } from "@/adapters/catalogue/london-venues";
import { MockVerifier } from "@/adapters/mock/mock-verifier";
import { PgBossJobQueue, QUEUES, startBoss, type DirectSearchJob } from "@/adapters/pgboss/jobs";
import { PgOptionRepository, PgParticipationRepository, PgRequestRepository, PgVenueCatalog } from "@/adapters/postgres/request-repos";
import { participants, users } from "@/adapters/postgres/schema";
import { createTestDb, type TestDb } from "@/adapters/postgres/test-db";
import { upsertVenues } from "@/adapters/postgres/venue-repo";
import { withSafety } from "@/adapters/verifier-decorators";
import { VerifierRegistry } from "@/adapters/verifier-registry";
import { createRequest, runDirectSearch, type RequestDeps } from "@/application/requests";

describe.skipIf(!process.env.TEST_DATABASE_URL)("pg-boss direct search job", () => {
  let t: TestDb;
  let boss: PgBoss;
  let deps: RequestDeps;
  const clock = { now: () => new Date("2026-11-21T10:00:00Z") };

  beforeAll(async () => {
    t = await createTestDb();
    await upsertVenues(t.db, LONDON_VENUES);
    boss = await startBoss(t.url, "worker");
    deps = {
      requests: new PgRequestRepository(t.db), options: new PgOptionRepository(t.db), participation: new PgParticipationRepository(t.db),
      venues: new PgVenueCatalog(t.db, ["mock"]), verifier: new VerifierRegistry([withSafety(new MockVerifier(clock), clock)], clock),
      jobs: new PgBossJobQueue(async () => boss), clock, newToken: () => uuid(),
    };
    await boss.work<DirectSearchJob>(QUEUES.directSearch, { pollingIntervalSeconds: 0.5 }, async ([job]) => {
      await runDirectSearch(deps, job.data.requestId, { recheck: job.data.recheck });
    });
  }, 30_000);
  afterAll(async () => {
    await boss?.stop({ graceful: false, close: true });
    await t?.close();
  });

  it("a created request is picked up by the worker and reaches RESULTS", async () => {
    const userId = uuid(), participantId = uuid();
    await t.db.insert(participants).values({ id: participantId, displayName: "O" });
    await t.db.insert(users).values({ id: userId, email: "o@example.test", participantId });
    const r = await createRequest(deps, {
      organizerUserId: userId, organizerParticipantId: participantId,
      search: { category: "tennis", date: "2026-11-21", earliestStart: "18:00", latestStart: "18:30", durationMins: 60, partySize: 2, areas: [] },
    });
    let status = r.status;
    for (let i = 0; i < 40 && status !== "RESULTS"; i++) {
      await new Promise((res) => setTimeout(res, 250));
      status = (await deps.requests.get(r.id))!.status;
    }
    expect(status).toBe("RESULTS");
  }, 20_000);
});
