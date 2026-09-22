import { prisma } from "@/lib/db/prisma";
import { Job, Prisma } from "@prisma/client";
import { getJobHandler } from "./handlers";

export interface WorkerConfig {
  concurrencyCap: number;
  processingTimeoutMs: number;
  pollIntervalMs: number;
  backoffBaseMs: number;
}

export const defaultConfig: WorkerConfig = {
  concurrencyCap: parseInt(process.env.JOB_CONCURRENCY || "5", 10),
  processingTimeoutMs: parseInt(process.env.JOB_PROCESSING_TIMEOUT_MS || "30000", 10),
  pollIntervalMs: parseInt(process.env.JOB_POLL_INTERVAL_MS || "200", 10),
  backoffBaseMs: parseInt(process.env.JOB_BACKOFF_BASE_MS || "1000", 10),
};

/**
 * Atomically claims the next pending job ready for execution using FOR UPDATE SKIP LOCKED.
 */
export async function claimNextJob(): Promise<Job | null> {
  const jobs = await prisma.$queryRaw<Job[]>`
    WITH next_job AS (
      SELECT id FROM "Job"
      WHERE status = 'pending'
        AND "runAt" <= NOW()
      ORDER BY "runAt" ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "Job"
    SET status = 'processing',
        "startedAt" = NOW(),
        "updatedAt" = NOW()
    FROM next_job
    WHERE "Job".id = next_job.id
    RETURNING "Job".*;
  `;

  return jobs.length > 0 ? jobs[0] : null;
}

/**
 * Recovers jobs that have been stuck in 'processing' status longer than the processing timeout.
 */
export async function recoverStuckJobs(timeoutMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - timeoutMs);

  // 1. Recover jobs that still have attempts remaining -> set back to 'pending' (will retry)
  const retryResult = await prisma.job.updateMany({
    where: {
      status: "processing",
      startedAt: { lt: cutoff },
      attempts: { lt: prisma.job.fields.maxAttempts },
    },
    data: {
      status: "pending",
      startedAt: null,
      lastError: `Recovered from stuck processing state (timeout ${timeoutMs}ms)`,
      runAt: new Date(),
    },
  });

  // 2. Mark stuck jobs that reached maxAttempts -> set to 'dead'
  // Fetch candidate jobs first to handle field comparison reliably across SQL DBs
  const deadCandidates = await prisma.job.findMany({
    where: {
      status: "processing",
      startedAt: { lt: cutoff },
    },
  });

  let deadCount = 0;
  for (const candidate of deadCandidates) {
    if (candidate.attempts >= candidate.maxAttempts) {
      await prisma.job.update({
        where: { id: candidate.id },
        data: {
          status: "dead",
          finishedAt: new Date(),
          lastError: `Stuck job reached max attempts (${candidate.maxAttempts}) during recovery`,
        },
      });
      deadCount++;
    }
  }

  return retryResult.count + deadCount;
}

/**
 * Executes a claimed job and handles success, failure, backoff, and idempotent output storage.
 */
export async function processClaimedJob(job: Job, config: WorkerConfig = defaultConfig): Promise<void> {
  const handler = getJobHandler(job.type);

  try {
    const rawOutput = await handler(job);
    const outputJson = (rawOutput ?? {}) as Prisma.InputJsonValue;

    // Store output idempotently using jobId as primary key
    await prisma.jobOutput.upsert({
      where: { jobId: job.id },
      create: { jobId: job.id, output: outputJson },
      update: { output: outputJson },
    });

    // Mark job succeeded
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    const newAttempts = job.attempts + 1;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (newAttempts >= job.maxAttempts) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "dead",
          attempts: newAttempts,
          lastError: errorMessage,
          finishedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } else {
      // Exponential backoff plus jitter calculation:
      // baseDelay = 2^newAttempts * backoffBaseMs
      // jitter = random value between 0 and backoffBaseMs
      const baseDelay = Math.pow(2, newAttempts) * config.backoffBaseMs;
      const jitter = Math.random() * config.backoffBaseMs;
      const nextRunAt = new Date(Date.now() + baseDelay + jitter);

      // Backoff scheduling: status set back to 'pending' with a delayed runAt
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "pending",
          attempts: newAttempts,
          lastError: errorMessage,
          runAt: nextRunAt,
          updatedAt: new Date(),
        },
      });
    }
  }
}

/**
 * Single worker instance runner loop.
 */
export class WorkerRunner {
  private activeJobs = 0;
  private maxActive = 0;
  private running = false;
  private config: WorkerConfig;

  constructor(config: Partial<WorkerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  public getActiveJobsCount(): number {
    return this.activeJobs;
  }

  public getMaxObservedActive(): number {
    return this.maxActive;
  }

  public async start(options: { runOnce?: boolean } = {}): Promise<void> {
    this.running = true;
    let recoveryTimer = Date.now();

    while (this.running) {
      // Periodic stuck job recovery
      if (Date.now() - recoveryTimer > 5000) {
        recoveryTimer = Date.now();
        await recoverStuckJobs(this.config.processingTimeoutMs).catch(() => {});
      }

      let claimed = false;
      if (this.activeJobs < this.config.concurrencyCap) {
        const job = await claimNextJob().catch(() => null);
        if (job) {
          claimed = true;
          this.activeJobs++;
          if (this.activeJobs > this.maxActive) {
            this.maxActive = this.activeJobs;
          }

          // Process job asynchronously in background without blocking loop
          processClaimedJob(job, this.config)
            .finally(() => {
              this.activeJobs--;
            });
        }
      }

      if (options.runOnce && !claimed && this.activeJobs === 0) {
        break;
      }

      if (!claimed) {
        await new Promise((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
      }
    }
  }

  public stop(): void {
    this.running = false;
  }
}
