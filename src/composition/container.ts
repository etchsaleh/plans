/**
 * Composition root — the ONLY place adapters are wired to ports.
 * Web routes and the worker both get their dependencies from here.
 */
import type { PgBoss } from "pg-boss";
import { env, organizerEmails, type Env } from "@/lib/env";
import { logger, type Logger } from "@/lib/logger";
import { createDb, type Db } from "@/adapters/postgres/db";
import { PgAuthRepository } from "@/adapters/postgres/auth-repo";
import { PgOptionRepository, PgParticipationRepository, PgRequestRepository, PgVenueCatalog } from "@/adapters/postgres/request-repos";
import { PgSnapshotStore } from "@/adapters/postgres/snapshot-store";
import { DevMailer, SmtpMailer } from "@/adapters/mail/mailers";
import { PgBossJobQueue, startBoss } from "@/adapters/pgboss/jobs";
import { randomToken, type AuthDeps } from "@/application/auth";
import { runDirectSearch, type RequestDeps } from "@/application/requests";
import type { Clock, JobQueue } from "@/ports";
import { buildVerification } from "./verification";

export type Container = {
  env: Env;
  logger: Logger;
  db: Db;
  clock: Clock;
  requests: RequestDeps;
  auth: AuthDeps;
  enabledVerifiers: string[];
  boss: () => Promise<PgBoss>;
};

const g = globalThis as unknown as { __planContainer?: Container };

export function getContainer(role: "web" | "worker" = "web"): Container {
  if (g.__planContainer) return g.__planContainer;
  const e = env();
  const clock: Clock = { now: () => new Date() };
  const { db } = createDb(e.DATABASE_URL);
  const { verifier, enabled } = buildVerification({ env: e, clock, logger, store: new PgSnapshotStore(db) });

  let bossP: Promise<PgBoss> | undefined;
  const boss = () => (bossP ??= startBoss(e.DATABASE_URL, role));

  const requests: RequestDeps = {
    requests: new PgRequestRepository(db),
    options: new PgOptionRepository(db),
    participation: new PgParticipationRepository(db),
    // Only offer venues some enabled verifier can actually check.
    venues: new PgVenueCatalog(db, enabled.map((v) => (v === "mock" ? "mock" : v))),
    verifier,
    jobs: undefined as unknown as JobQueue,
    clock,
    newToken: () => randomToken(16),
  };
  // JOBS_MODE=inline runs searches in-process (dev/e2e without a worker); default is pg-boss.
  requests.jobs =
    e.JOBS_MODE === "inline"
      ? {
          enqueueDirectSearch: async (id, opts) => {
            void runDirectSearch(requests, id, opts).catch((err) => logger.error({ err, requestId: id }, "inline search failed"));
          },
        }
      : new PgBossJobQueue(boss);

  const auth: AuthDeps = {
    auth: new PgAuthRepository(db),
    mailer: e.SMTP_URL ? new SmtpMailer(e.SMTP_URL, e.MAIL_FROM) : new DevMailer(db, logger),
    clock,
    appUrl: e.APP_URL,
    organizerEmails: organizerEmails(e),
  };

  g.__planContainer = { env: e, logger, db, clock, requests, auth, enabledVerifiers: enabled, boss };
  return g.__planContainer;
}
