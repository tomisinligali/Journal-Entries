import { Job } from "@prisma/client";
import { Resend } from "resend";

export type JobHandler = (job: Job) => Promise<any>;

const handlers: Record<string, JobHandler> = {
  // Standard test job
  TEST_JOB: async (job: Job) => {
    const payload = job.payload as { message?: string; delayMs?: number } | null;
    if (payload?.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, payload.delayMs));
    }
    return {
      jobId: job.id,
      executedAt: new Date().toISOString(),
      message: payload?.message || "Test job completed successfully",
    };
  },

  // Job configured to fail for testing retries and dead-letter handling
  FAILING_JOB: async (job: Job) => {
    const payload = job.payload as { failUntilAttempt?: number; errorMessage?: string } | null;
    const failUntil = payload?.failUntilAttempt ?? 999;
    
    // Check if current attempt should fail
    if (job.attempts + 1 < failUntil) {
      throw new Error(payload?.errorMessage || `Intentional failure on attempt ${job.attempts + 1}`);
    }

    return {
      jobId: job.id,
      executedAt: new Date().toISOString(),
      recoveredOnAttempt: job.attempts + 1,
    };
  },

  // Real email send through Resend (slow/unreliable work used to exercise the system)
  SEND_EMAIL: async (job: Job) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const payload = job.payload as
      | { to?: string; subject?: string; from?: string; html?: string }
      | null;
    if (!payload?.to || !payload?.subject) {
      throw new Error("Missing required payload fields: to, subject");
    }

    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: payload.from || process.env.EMAIL_FROM || "Journal App <onboarding@resend.dev>",
      to: [payload.to],
      subject: payload.subject,
      html: payload.html || "<p>This email was sent from the background job system.</p>",
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      messageId: data?.id,
      provider: "resend",
      executedAt: new Date().toISOString(),
    };
  },

  // Job for account hard deletion (from PRD requirements)
  HARD_DELETE_USER: async (job: Job) => {
    const payload = job.payload as { userId: string } | null;
    if (!payload?.userId) {
      throw new Error("Missing required payload field: userId");
    }
    return {
      jobId: job.id,
      userId: payload.userId,
      status: "user_deleted_stub",
      executedAt: new Date().toISOString(),
    };
  },
};

export function getJobHandler(type: string): JobHandler {
  const handler = handlers[type];
  if (!handler) {
    return async (job: Job) => ({
      jobId: job.id,
      type: job.type,
      executedAt: new Date().toISOString(),
      note: `Default execution for registered type: ${type}`,
    });
  }
  return handler;
}
