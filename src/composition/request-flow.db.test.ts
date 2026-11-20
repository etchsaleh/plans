import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { v7 as uuid } from "uuid";
import { LONDON_VENUES } from "@/adapters/catalogue/london-venues";
import { MockVerifier } from "@/adapters/mock/mock-verifier";
import { PgOptionRepository, PgParticipationRepository, PgRequestRepository, PgVenueCatalog } from "@/adapters/postgres/request-repos";
import { participants, requestStatusHistory, users, availabilitySnapshots } from "@/adapters/postgres/schema";
import { PgSnapshotStore } from "@/adapters/postgres/snapshot-store";
import { createTestDb, type TestDb } from "@/adapters/postgres/test-db";
import { upsertVenues } from "@/adapters/postgres/venue-repo";
import { withAudit, withSafety } from "@/adapters/verifier-decorators";
import { VerifierRegistry } from "@/adapters/verifier-registry";
import {
  chooseOption, createRequest, ForbiddenError, openRequest, organizerAction, runDirectSearch, setPreference, setRsvp, ValidationError,
  type RequestDeps,
} from "@/application/requests";

const now = new Date("2026-11-21T10:00:00Z");
const clock = { now: () => now };

describe.skipIf(!process.env.TEST_DATABASE_URL)("request flow (direct path, mock verifier, Postgres)", () => {
  let t: TestDb;
  let deps: RequestDeps;
  const enqueued: string[] = [];
  const organizer = { userId: uuid(), participantId: uuid() };
  const friend = uuid();
  const stranger = uuid();

  beforeAll(async () => {
    t = await createTestDb();
    await upsertVenues(t.db, LONDON_VENUES);
    await t.db.insert(participants).values([
      { id: organizer.participantId, displayName: "Hesham" }, { id: friend, displayName: "Sam" }, { id: stranger, displayName: "X" },
    ]);
    await t.db.insert(users).values({ id: organizer.userId, email: "organizer@example.test", participantId: organizer.participantId });
    const inner = new VerifierRegistry([withSafety(new MockVerifier(clock), clock)], clock);
    let n = 0;
    deps = {
      requests: new PgRequestRepository(t.db),
      options: new PgOptionRepository(t.db),
      participation: new PgParticipationRepository(t.db),
      venues: new PgVenueCatalog(t.db, ["mock"]),
      verifier: withAudit(inner, { store: new PgSnapshotStore(t.db), clock }),
      jobs: { enqueueDirectSearch: async (id) => void enqueued.push(id) },
      clock,
      newToken: () => `tok${++n}${Math.random().toString(36).slice(2, 8)}`,
    };
  });
  afterAll(async () => t?.close());

  const search = { category: "padel" as const, date: "2026-11-21", earliestStart: "18:00", latestStart: "19:00", durationMins: 60, partySize: 4, areas: [] };

  it("rejects invalid searches server-side", async () => {
    await expect(createRequest(deps, { organizerUserId: organizer.userId, organizerParticipantId: organizer.participantId, search: { ...search, date: "2026-11-01" } }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it("runs the whole loop: search → options → friend prefs → choose → booked with evidence", async () => {
    const r = await createRequest(deps, { organizerUserId: organizer.userId, organizerParticipantId: organizer.participantId, search });
    expect(enqueued).toContain(r.id);

    const done = await runDirectSearch(deps, r.id);
    expect(done.status).toBe("RESULTS");
    // re-running the job is a no-op
    expect((await runDirectSearch(deps, r.id)).status).toBe("RESULTS");

    const snaps = await t.db.select().from(availabilitySnapshots).where(eq(availabilitySnapshots.requestId, r.id));
    expect(snaps.length).toBeGreaterThan(0);

    const asFriend = await openRequest(deps, r.shareToken, friend);
    expect(asFriend.role).toBe("member");
    expect(asFriend.options.length).toBeGreaterThan(0);
    expect(asFriend.options[0]).not.toHaveProperty("source");
    // "gone on recheck" demo venue is available on the first check too
    const opt = asFriend.options[0];

    await setPreference(deps, r.shareToken, friend, opt.id, "up");
    await setRsvp(deps, r.shareToken, friend, "in");
    const asOrg = await openRequest(deps, r.shareToken, organizer.participantId);
    expect(asOrg.role).toBe("organizer");
    expect(asOrg.options.find((o) => o.id === opt.id)?.tally.up).toBe(1);
    expect(asOrg.options[0]).toHaveProperty("source");
    expect(asOrg.attendees).toEqual([{ participantId: friend, name: "Sam", value: "in" }]);

    await expect(chooseOption(deps, r.shareToken, friend, opt.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await chooseOption(deps, r.shareToken, organizer.participantId, opt.id)).status).toBe("SELECTED");
    await expect(organizerAction(deps, r.shareToken, organizer.participantId, { type: "booked", reference: "" })).rejects.toThrow(/reference/);
    const booked = await organizerAction(deps, r.shareToken, organizer.participantId, { type: "booked", reference: "PT-998877" });
    expect(booked.status).toBe("BOOKED");

    const hist = await t.db.select().from(requestStatusHistory).where(eq(requestStatusHistory.requestId, r.id)).orderBy(requestStatusHistory.at);
    expect(hist.map((h) => h.toStatus)).toEqual(["QUEUED", "CHECKING", "RESULTS", "SELECTED", "BOOKED"]);

    const friendView = await openRequest(deps, r.shareToken, friend);
    expect(friendView.request.bookingReference).toBe("on file");
  });

  it("people without the link can't act", async () => {
    const r = await createRequest(deps, { organizerUserId: organizer.userId, organizerParticipantId: organizer.participantId, search });
    await expect(setRsvp(deps, r.shareToken, stranger, "in")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("re-check keeps options' ids (preferences survive) and refreshes evidence", async () => {
    const r = await createRequest(deps, { organizerUserId: organizer.userId, organizerParticipantId: organizer.participantId, search });
    await runDirectSearch(deps, r.id);
    const before = (await openRequest(deps, r.shareToken, organizer.participantId)).options.map((o) => o.id).sort();
    await organizerAction(deps, r.shareToken, organizer.participantId, { type: "recheck" });
    await runDirectSearch(deps, r.id, { recheck: true });
    const after = await openRequest(deps, r.shareToken, organizer.participantId);
    // the "gone on recheck" demo venue drops out; others keep their ids
    expect(after.options.length).toBeLessThan(before.length);
    for (const o of after.options) expect(before).toContain(o.id);
  });
});
