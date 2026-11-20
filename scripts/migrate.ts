import { createDb, runMigrations } from "@/adapters/postgres/db";

const url = process.env.DATABASE_URL ?? "postgres://plan@localhost:5433/plan";
const { db, pool } = createDb(url);
runMigrations(db)
  .then(() => console.log("migrations applied"))
  .finally(() => pool.end());
