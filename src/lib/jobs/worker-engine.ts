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
 * Sweeps jobs stuck in 'processing' longer than the timeout (Step 6).
 * Each stuck job gets an incremented attempt count: if attempts remain it is
 * reset to 'pending' (ready to run again); if this brings it to maxAttempts it
 * becomes 'dead'.
 */
export async function recoverStuckJobs(timeoutMs: number): Promise<number> {
  // Use the database clock (NOW()) for the cutoff so the sweep stays correct
  // regardless of the connection's timezone vs. the UTC timestamps Prisma writes.
  const stuckCandidates = await prisma.$queryRaw<Job[]>`
    SELECT * FROM "Job"
    WHERE status = 'processing'
      AND "startedAt" < NOW() - make_interval(secs => ${timeoutMs / 1000})
  `;

  let recoveredCount = 0;
  for (const candidate of stuckCandidates) {
    const newAttempts = candidate.attempts + 1;

    if (newAttempts >= candidate.maxAttempts) {
      await prisma.job.update({
        where: { id: candidate.id },
        data: {
          status: "dead",
          attempts: newAttempts,
          finishedAt: new Date(),
          lastError: `Stuck job reached max attempts (${candidate.maxAttempts}) during recovery`,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.job.update({
        where: { id: candidate.id },
        data: {
          status: "pending",
          attempts: newAttempts,
          startedAt: null,
          lastError: `Recovered from stuck processing state (timeout ${timeoutMs}ms)`,
          runAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    recoveredCount++;
  }

  return recoveredCount;
}

/**
 * Executes a claimed job and handles success, failure, backoff, and idempotent output storage.
 */
export async function processClaimedJob(job: Job, config: WorkerConfig = defaultConfig): Promise<void> {
  // Idempotency guard (Step 5): the work may have already completed in a prior run —
  // e.g. the worker crashed after doing the work but before marking the job succeeded.
  // If output already exists for this jobId, skip the work entirely and just mark succeeded.
  const existingOutput = await prisma.jobOutput.findUnique({
    where: { jobId: job.id },
  });

  if (existingOutput) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return;
  }

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
