import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export interface EnqueueJobOptions {
  type: string;
  payload: Prisma.InputJsonValue;
  idempotencyKey: string;
  runAt?: Date;
  maxAttempts?: number;
}

export async function enqueueJob(options: EnqueueJobOptions) {
  const { type, payload, idempotencyKey, runAt = new Date(), maxAttempts = 3 } = options;

  try {
    const job = await prisma.job.create({
      data: {
        type,
        payload,
        idempotencyKey,
        runAt,
        maxAttempts,
        status: "pending",
      },
    });

    return { job, isDuplicate: false };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Idempotency constraint hit: retrieve existing job
      const existingJob = await prisma.job.findUnique({
        where: { idempotencyKey },
      });

      if (!existingJob) {
        throw error;
      }

      return { job: existingJob, isDuplicate: true };
    }
    throw error;
  }
}

export async function getJobById(id: string) {
  return prisma.job.findUnique({
    where: { id },
  });
}
