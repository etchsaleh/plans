import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { v7 as uuid } from "uuid";
import { availabilitySnapshots, venues, verificationPayloads } from "./schema";
import { PgSnapshotStore } from "./snapshot-store";
import { createTestDb, type TestDb } from "./test-db";

describe.skipIf(!process.env.TEST_DATABASE_URL)("PgSnapshotStore", () => {
  let t: TestDb;
  beforeAll(async () => { t = await createTestDb(); });
  afterAll(async () => t?.close());

  it("persists snapshot + raw payload with checkedAt and source", async () => {
    const venueId = uuid();
    await t.db.insert(venues).values({ id: venueId, provider: "mock", externalId: "s1", name: "S", activity: "tennis", area: "A" });
    const id = uuid();
    const checkedAt = new Date("2026-11-21T10:00:00Z");
    await new PgSnapshotStore(t.db).append({
      id, purpose: "initial", status: "AVAILABLE", tier: "LICENSED", verifier: "royalparks",
      query: { venueId, activity: "tennis", start: new Date("2026-11-21T17:00:00Z"), durationMins: 60, partySize: 4 },
      evidence: { source: "royalparks:https://…", checkedAt, fromCache: false, rawPayload: { contentType: "application/json", body: '{"a":1}' } },
      matched: { start: new Date("2026-11-21T17:00:00Z"), durationMins: 60, resources: [{ id: "Court 2" }] },
      latencyMs: 1234,
    });
    const [row] = await t.db.select().from(availabilitySnapshots).where(eq(availabilitySnapshots.id, id));
    expect(row).toMatchObject({ status: "AVAILABLE", verifier: "royalparks", checkedAt, source: "royalparks:https://…" });
    const [payload] = await t.db.select().from(verificationPayloads).where(eq(verificationPayloads.id, row.rawPayloadId!));
    expect(payload.body).toBe('{"a":1}');
  });
});
