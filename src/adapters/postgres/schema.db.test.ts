import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { v7 as uuid } from "uuid";
import { availabilitySnapshots, venues } from "./schema";
import { createTestDb, type TestDb } from "./test-db";

/** Drizzle wraps driver errors; the Postgres message lives on `cause`. */
async function pgError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no error";
  } catch (e) {
    const err = e as { cause?: { message?: string }; message: string };
    return err.cause?.message ?? err.message;
  }
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("postgres schema", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => t?.close());

  it("keeps availability_snapshots append-only", async () => {
    const venueId = uuid();
    await t.db.insert(venues).values({
      id: venueId, provider: "mock", externalId: "v1", name: "Test", activity: "padel", area: "Battersea",
    });
    const id = uuid();
    await t.db.insert(availabilitySnapshots).values({
      id, venueId, verifier: "mock", tier: "MOCK", source: "mock://", slotStart: new Date(),
      partySize: 4, status: "AVAILABLE", checkedAt: new Date(), purpose: "initial",
    });
    expect(await pgError(t.db.execute(sql`UPDATE availability_snapshots SET status = 'UNKNOWN' WHERE id = ${id}`)))
      .toMatch(/append-only \(UPDATE blocked\)/);
    expect(await pgError(t.db.execute(sql`DELETE FROM availability_snapshots WHERE id = ${id}`)))
      .toMatch(/append-only \(DELETE blocked\)/);
  });

  it("enforces one venue per provider/external id", async () => {
    const row = { provider: "mock", externalId: "dup", name: "A", activity: "padel" as const, area: "Soho" };
    await t.db.insert(venues).values({ id: uuid(), ...row });
    await expect(t.db.insert(venues).values({ id: uuid(), ...row })).rejects.toThrow();
  });
});
