/**
 * Composition root — the ONLY place adapters are wired to ports.
 * Filled in slice by slice; app routes and the worker get their dependencies from here.
 */
import { env, type Env } from "@/lib/env";
import { logger, type Logger } from "@/lib/logger";
import { createDb, type Db } from "@/adapters/postgres/db";

export type Container = { env: Env; logger: Logger; db: Db };

let container: Container | undefined;

export function getContainer(): Container {
  if (container) return container;
  const e = env();
  const { db } = createDb(e.DATABASE_URL);
  container = { env: e, logger, db };
  return container;
}
