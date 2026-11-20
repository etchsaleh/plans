import { QUEUES, type DirectSearchJob } from "@/adapters/pgboss/jobs";
import { runMigrations } from "@/adapters/postgres/db";
import { runDirectSearch } from "@/application/requests";
import { getContainer } from "./container";

/** Starts the pg-boss worker: direct searches (verifier calls) run here, off the request path. */
export async function startWorker(): Promise<() => Promise<void>> {
  const c = getContainer("worker");
  await runMigrations(c.db);
  const boss = await c.boss();
  boss.on("error", (err) => c.logger.error({ err }, "pg-boss error"));
  await boss.work<DirectSearchJob>(QUEUES.directSearch, async ([job]) => {
    const { requestId, recheck } = job.data;
    c.logger.info({ requestId, recheck, jobId: job.id }, "direct search: start");
    const r = await runDirectSearch(c.requests, requestId, { recheck });
    c.logger.info({ requestId, status: r.status }, "direct search: done");
  });
  c.logger.info({ verifiers: c.enabledVerifiers }, "worker started");
  return () => boss.stop({ graceful: true, timeout: 30_000 });
}
