import { createDb, runMigrations } from "@/adapters/postgres/db";
import { upsertVenues } from "@/adapters/postgres/venue-repo";
import { LONDON_VENUES } from "@/adapters/catalogue/london-venues";
import { env } from "@/lib/env";

const { db, pool } = createDb(env().DATABASE_URL);
runMigrations(db)
  .then(() => upsertVenues(db, LONDON_VENUES))
  .then(() => console.log(`seeded ${LONDON_VENUES.length} venues`))
  .finally(() => pool.end());
