import { PgBoss } from "pg-boss";
import type { JobQueue } from "@/ports";

export const QUEUES = { directSearch: "direct_search" } as const;
export type DirectSearchJob = { requestId: string; recheck?: boolean };

export async function startBoss(connectionString: string, role: "web" | "worker"): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString,
    // The web process only enqueues; maintenance and cron run in the worker.
    supervise: role === "worker",
    schedule: role === "worker",
  });
  await boss.start();
  // `stately`: at most one queued + one active job per singletonKey (= request id) → idempotent enqueue.
  await boss.createQueue(QUEUES.directSearch, { policy: "stately", retryLimit: 3, retryDelay: 15, retryBackoff: true, expireInSeconds: 600 });
  return boss;
}

export class PgBossJobQueue implements JobQueue {
  constructor(private readonly boss: () => Promise<PgBoss>) {}
  async enqueueDirectSearch(requestId: string, opts: { recheck?: boolean } = {}) {
    const data: DirectSearchJob = { requestId, recheck: opts.recheck };
    await (await this.boss()).send(QUEUES.directSearch, data, { singletonKey: requestId });
  }
}
