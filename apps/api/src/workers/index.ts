import { Queue, Worker } from "bullmq";
import { config } from "../config";
import { logger } from "../logger";
import { bullConnection } from "../redis";
import { syncLive, syncWindow } from "../services/football-sync";
import { syncPantaMarkets } from "../services/markets";

async function reset(queue: Queue) {
  const jobs = await queue.getRepeatableJobs();
  for (const job of jobs) await queue.removeRepeatableByKey(job.key);
}

export async function startWorkers() {
  const football = new Queue("football", { connection: bullConnection() });
  const markets = new Queue("panta", { connection: bullConnection() });
  await reset(football);
  await reset(markets);
  await football.add("live", {}, { repeat: { every: Math.max(config.footballPollMs, 15000) }, removeOnComplete: 20, removeOnFail: 20 });
  await football.add("window", {}, { repeat: { every: Math.max(config.fixturePollMs, 60000) }, removeOnComplete: 10, removeOnFail: 10 });
  await markets.add("sync", {}, { repeat: { every: 15000 }, removeOnComplete: 20, removeOnFail: 20 });

  const footballWorker = new Worker(
    "football",
    async (job) => {
      if (job.name === "live") await syncLive();
      if (job.name === "window") await syncWindow();
    },
    { connection: bullConnection(), concurrency: 1 },
  );
  const marketWorker = new Worker("panta", async () => syncPantaMarkets(), {
    connection: bullConnection(),
    concurrency: 1,
  });
  footballWorker.on("failed", (job, err) => logger.error({ job: job?.name, err: err.message }, "football job failed"));
  marketWorker.on("failed", (job, err) => logger.error({ job: job?.name, err: err.message }, "panta job failed"));

  await syncWindow().catch((error: unknown) => logger.warn({ err: error instanceof Error ? error.message : "window" }, "initial window sync"));
  await syncPantaMarkets().catch((error: unknown) => logger.warn({ err: error instanceof Error ? error.message : "panta" }, "initial panta sync"));
  logger.info("workers started");
}
