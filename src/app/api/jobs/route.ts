import { enqueueJob } from "@/lib/jobs/queue";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";
import { JobStatus } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, payload, idempotencyKey, runAt, maxAttempts } = body;

    if (!type || typeof type !== "string") {
      return NextResponse.json(
        { error: "Missing required string parameter: type" },
        { status: 400 }
      );
    }

    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      return NextResponse.json(
        { error: "Missing required string parameter: idempotencyKey" },
        { status: 400 }
      );
    }

    const parsedRunAt = runAt ? new Date(runAt) : undefined;
    const parsedMaxAttempts = typeof maxAttempts === "number" ? maxAttempts : undefined;

    const { job, isDuplicate } = await enqueueJob({
      type,
      payload: payload ?? {},
      idempotencyKey,
      runAt: parsedRunAt,
      maxAttempts: parsedMaxAttempts,
    });

    return NextResponse.json(
      {
        jobId: job.id,
        type: job.type,
        status: job.status,
        idempotencyKey: job.idempotencyKey,
        isDuplicate,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("Error in POST /api/jobs:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  try {
    const whereClause = status ? { status: status as JobStatus } : {};
    const jobs = await prisma.job.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        output: true,
      },
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Error in GET /api/jobs:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
