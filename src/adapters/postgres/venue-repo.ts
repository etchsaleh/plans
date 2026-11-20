import { sql } from "drizzle-orm";
import type { Venue } from "@/domain/venue";
import type { Db } from "./db";
import { venues } from "./schema";

export async function upsertVenues(db: Db, list: Venue[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(venues)
    .values(list.map((v) => ({ ...v, priceBand: v.priceBand ?? null })))
    .onConflictDoUpdate({
      target: [venues.provider, venues.externalId],
      set: {
        name: sql`excluded.name`, area: sql`excluded.area`, activity: sql`excluded.activity`,
        priceBand: sql`excluded.price_band`, tags: sql`excluded.tags`, bookingRef: sql`excluded.booking_ref`,
        updatedAt: sql`now()`,
      },
    });
}
