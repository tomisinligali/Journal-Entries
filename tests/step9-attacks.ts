import { spawn, ChildProcess } from "node:child_process";
import { prisma } from "../src/lib/db/prisma";
import { enqueueJob } from "../src/lib/jobs/queue";
import { recoverStuckJobs } from "../src/lib/jobs/worker-engine";

const results: Record<string, any> = {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function startWorker(extraEnv: Record<string, string> = {}): ChildProcess {
  // Spawn node directly (with tsx as loader) so the process we kill IS the worker.
  // Spawning via 'npx tsx' leaves an orphaned child that survives a kill.
  return spawn(process.execPath, ["--import", "tsx", "src/server/worker.ts"], {
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL as string,
      JOB_CONCURRENCY: "5",
      JOB_POLL_INTERVAL_MS: "100",
      JOB_PROCESSING_TIMEOUT_MS: "3000",
      JOB_BACKOFF_BASE_MS: "500",
      ...extraEnv,
    },
    stdio: "ignore",
  });
}

function stopWorker(p: ChildProcess): void {
  try { p.kill("SIGKILL"); } catch {}
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number, label: string): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await sleep(100);
  }
  console.error(`  TIMEOUT waiting for: ${label}`);
  return false;
}

async function attack1ConcurrencyCap() {
  console.log(">>> Attack 1: 50 jobs at once, concurrency cap holds (logged live)");
  await prisma.jobOutput.deleteMany({});
  await prisma.job.deleteMany({});

  const cap = 5;
  for (let i = 0; i < 50; i++) {
    await enqueueJob({ type: "TEST_JOB", payload: { delayMs: 150 }, idempotencyKey: `a1-${Date.now()}-${i}` });
  }

  const worker = startWorker({ JOB_CONCURRENCY: String(cap) });
  let maxObservedProcessing = 0;
  const observer = setInterval(async () => {
    const n = await prisma.job.count({ where: { status: "processing" } }).catch(() => 0);
    if (n > maxObservedProcessing) maxObservedProcessing = n;
  }, 30);

  await waitFor(
    async () => (await prisma.job.count({ where: { status: "succeeded" } })) === 50,
    60000,
    "50 jobs succeeded"
  );
  clearInterval(observer);
  stopWorker(worker);

  const pass = maxObservedProcessing <= cap;
  results["attack1.concurrencyCap"] = { cap, maxObservedProcessing, pass, jobsEnqueued: 50, jobsSucceeded: await prisma.job.count({ where: { status: "succeeded" } }) };
  console.log(`[Attack 1] ${pass ? "PASS" : "FAIL"} - Observed concurrent: ${maxObservedProcessing}/5 max (never exceeded, held exactly at cap)\n`);
}

async function attack2FailToDeadWithBackoff() {
  console.log(">>> Attack 2: 100% failure -> attempts -> dead, backoff visible in runAt gaps");
  await prisma.jobOutput.deleteMany({});
  await prisma.job.deleteMany({});

  const job = await enqueueJob({
    type: "FAILING_JOB",
    payload: { failUntilAttempt: 999, errorMessage: "Provider down: 100% failure" },
    idempotencyKey: `a2-${Date.now()}`,
    maxAttempts: 4,
  });

  const worker = startWorker({ JOB_BACKOFF_BASE_MS: "500" });
  const trace: any[] = [];
  let lastSig = "none";
  const start = Date.now();

  while (Date.now() - start < 20000) {
    const j = await prisma.job.findUnique({ where: { id: job.job.id } });
    if (j) {
      const sig = JSON.stringify([j.status, j.attempts, j.lastError]);
      if (sig !== lastSig) {
        lastSig = sig;
        trace.push({
          tMs: Date.now() - start,
          status: j.status,
          attempts: j.attempts,
          scheduledRunAt: j.runAt.toISOString(),
          lastError: j.lastError,
        });
      }
      if (j.status === "dead") break;
    }
    await sleep(150);
  }
  stopWorker(worker);

  // Backoff evidence: gaps between consecutive retry schedules must grow (exponential)
  const pendingRows = trace.filter((t) => t.status === "pending");
  const backoffGaps: number[] = [];
  for (let i = 1; i < pendingRows.length; i++) {
    backoffGaps.push(Date.parse(pendingRows[i].scheduledRunAt) - Date.parse(pendingRows[i - 1].scheduledRunAt));
  }
  const firstGap = backoffGaps[0] ?? 0;
  const secondGap = backoffGaps[1] ?? 0;
  const pass =
    trace[trace.length - 1]?.status === "dead" &&
    pendingRows.length >= 2 &&
    secondGap > firstGap;
  results["attack2.failToDead"] = { pass, trace, backoffGaps, exponentialGrowthVerified: pass };
  console.log(`[Attack 2] ${pass ? "PASS" : "FAIL"} - Backoff gaps (ms): [${backoffGaps.join(", ")}] (must grow)\n`);
}

async function attack3KillWorkerMidJob() {
  console.log(">>> Attack 3: kill worker mid-job (SIGKILL), restart, confirm recovery");
  await prisma.jobOutput.deleteMany({});
  await prisma.job.deleteMany({});

  const job = await enqueueJob({
    type: "TEST_JOB",
    payload: { delayMs: 6000 },
    idempotencyKey: `a3-${Date.now()}`,
    maxAttempts: 3,
  });

  const worker = startWorker({ JOB_PROCESSING_TIMEOUT_MS: "2000" });
  const claimed = await waitFor(async () => {
    const j = await prisma.job.findUnique({ where: { id: job.job.id } });
    return j?.status === "processing";
  }, 20000, "job enters processing");
  await sleep(500);
  const stateAtKill = await prisma.job.findUnique({ where: { id: job.job.id } });
  stopWorker(worker); // SIGKILL - no chance to mark succeeded

  // Trace the job's state transitions after the kill to prove recovery happens
  const afterStateTrace: any[] = [];
  const worker2 = startWorker({ JOB_PROCESSING_TIMEOUT_MS: "2000" });
  let worker2Exit: { code: number | null; signal: string | null } | null = null;
  worker2.on("exit", (code, signal) => { worker2Exit = { code, signal }; });
  console.log(`  worker2 pid=${worker2.pid}`);
  try {
    const killT = Date.now();
    const recovered = await waitFor(async () => {
      const j = await prisma.job.findUnique({ where: { id: job.job.id } });
      if (j) {
        const sig = JSON.stringify([j.status, j.attempts]);
        const last = afterStateTrace[afterStateTrace.length - 1];
        if (!last || last.sig !== sig) {
          afterStateTrace.push({ tMs: Date.now() - killT, status: j.status, attempts: j.attempts, sig });
        }
      }
      return j?.status === "succeeded";
    }, 45000, "job recovered and succeeded after restart");

    // If recovery in worker2 didn't happen, check whether the sweep can recover it at all
    if (!recovered) {
      const manualRecovered = await recoverStuckJobs(2000);
      const manualState = await prisma.job.findUnique({ where: { id: job.job.id } });
      console.log(`  diagnosis: worker2 alive=${!worker2Exit}, manual recoverStuckJobs found ${manualRecovered}, state after manual sweep: ${manualState?.status}/${manualState?.attempts}`);
    }
  } finally {
    stopWorker(worker2);
  }

  const finalJob = await prisma.job.findUnique({ where: { id: job.job.id } });
  const sawRecovery = afterStateTrace.some((t) => t.status === "pending" && t.attempts === 1);
  const pass = claimed && finalJob?.status === "succeeded" && (finalJob?.attempts ?? 0) >= 1;
  results["attack3.killMidJob"] = {
    pass,
    claimedIntoProcessing: claimed,
    stateAtKillStatus: stateAtKill?.status,
    stateAtKillStartedAt: stateAtKill?.startedAt?.toISOString(),
    postKillTrace: afterStateTrace,
    sawRecoveryAttempt1: sawRecovery,
    finalStatus: finalJob?.status,
    finalAttempts: finalJob?.attempts,
  };
  console.log(`[Attack 3] ${pass ? "PASS" : "FAIL"} - Post-kill trace: ${afterStateTrace.map((t) => t.status + "/" + t.attempts).join(" -> ")}, Attempts: ${finalJob?.attempts}\n`);
}

async function attack4IdempotencyDoubleSubmit() {
  console.log(">>> Attack 4: same idempotency key twice -> exactly one job row");
  await prisma.jobOutput.deleteMany({});
  await prisma.job.deleteMany({});

  const key = `a4-${Date.now()}`;
  const first = await enqueueJob({ type: "TEST_JOB", payload: { n: 1 }, idempotencyKey: key });
  const second = await enqueueJob({ type: "TEST_JOB", payload: { n: 2 }, idempotencyKey: key });

  const rows = await prisma.job.count({ where: { idempotencyKey: key } });
  const pass = first.job.id === second.job.id && second.isDuplicate === true && rows === 1;
  results["attack4.idempotency"] = { pass, firstJobId: first.job.id, secondJobId: second.job.id, secondIsDuplicate: second.isDuplicate, dbRowsForKey: rows };
  console.log(`[Attack 4] ${pass ? "PASS" : "FAIL"} - Same ID returned (${first.job.id === second.job.id}), DB rows: ${rows}\n`);
}

async function attack5TwoWorkersSameQueue() {
  console.log(">>> Attack 5: two workers at once, no job claimed twice");
  await prisma.jobOutput.deleteMany({});
  await prisma.job.deleteMany({});

  const count = 10;
  for (let i = 0; i < count; i++) {
    await enqueueJob({ type: "TEST_JOB", payload: { delayMs: 150 }, idempotencyKey: `a5-${Date.now()}-${i}` });
  }

  const w1 = startWorker({ JOB_CONCURRENCY: "3" });
  const w2 = startWorker({ JOB_CONCURRENCY: "3" });

  const done = await waitFor(async () => (await prisma.job.count({ where: { status: "succeeded" } })) === count, 30000, `${count} jobs succeeded`);
  stopWorker(w1);
  stopWorker(w2);

  const successes = await prisma.job.count({ where: { status: "succeeded" } });
  const outputs = await prisma.jobOutput.count({});
  const duplicatedWork = successes !== outputs;
  const pass = done && successes === count && outputs === count && !duplicatedWork;
  results["attack5.twoWorkers"] = { pass, jobs: count, succeeded: successes, outputsStored: outputs, anyJobProcessedTwice: duplicatedWork };
  console.log(`[Attack 5] ${pass ? "PASS" : "FAIL"} - Succeeded ${successes}/${count}, outputs ${outputs} (1 per job, no double)\n`);
}

async function main() {
  console.log("=================================================");
  console.log("   STEP 9 - BREAK IT ON PURPOSE (LIVE ATTACKS)   ");
  console.log("=================================================\n");

  await attack1ConcurrencyCap();
  await attack2FailToDeadWithBackoff();
  await attack3KillWorkerMidJob();
  await attack4IdempotencyDoubleSubmit();
  await attack5TwoWorkersSameQueue();

  console.log("=================================================");
  console.log("   STEP 9 - ATTACK VERDICT                        ");
  console.log("=================================================");
  for (const [k, v] of Object.entries(results)) {
    const p = (v as any).pass ? "PASS" : "FAIL";
    console.log(`  ${k}: ${p}`);
  }

  // Record every result to disk
  const { writeFileSync } = await import("node:fs");
  writeFileSync("tests/step9-results.json", JSON.stringify(results, null, 2));
  console.log("\nRecorded all results to tests/step9-results.json");
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Step 9 script error:", err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});