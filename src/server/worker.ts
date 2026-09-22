import { WorkerRunner } from "../lib/jobs/worker-engine";

async function main() {
  console.log(`[Worker Process ${process.pid}] Starting background job worker...`);
  
  const runner = new WorkerRunner();
  
  process.on("SIGINT", () => {
    console.log(`[Worker Process ${process.pid}] Shutting down worker...`);
    runner.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log(`[Worker Process ${process.pid}] Shutting down worker...`);
    runner.stop();
    process.exit(0);
  });

  await runner.start();
}

main().catch((err) => {
  console.error("[Worker Process Error]", err);
  process.exit(1);
});
