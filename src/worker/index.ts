/** `npm run worker` — background jobs (see src/composition/worker.ts). */
import { startWorker } from "@/composition/worker";

startWorker()
  .then((stop) => {
    const exit = () => stop().finally(() => process.exit(0));
    process.on("SIGINT", exit);
    process.on("SIGTERM", exit);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
