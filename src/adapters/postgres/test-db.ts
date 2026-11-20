import { sql } from "drizzle-orm";
import { createDb, runMigrations, type Db } from "./db";

export type TestDb = { db: Db; close: () => Promise<void> };

/**
 * A fresh, migrated database per test file (drizzle migrations reference the
 * `public` schema explicitly, so schema-per-test isn't an option).
 * TEST_DATABASE_URL must point at a database the user can CREATE DATABASE from.
 */
export async function createTestDb(): Promise<TestDb> {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL not set");
  const name = `plan_t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = createDb(base);
  await admin.db.execute(sql.raw(`CREATE DATABASE "${name}"`));

  const url = new URL(base);
  url.pathname = `/${name}`;
  const { db, pool } = createDb(url.toString());
  await runMigrations(db);
  return {
    db,
    close: async () => {
      await pool.end();
      await admin.db.execute(sql.raw(`DROP DATABASE "${name}" WITH (FORCE)`));
      await admin.pool.end();
    },
  };
}
