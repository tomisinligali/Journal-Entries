import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Reset dead or failed job back to pending for manual retry
    const updatedJob = await prisma.job.update({
      where: { id },
      data: {
        status: "pending",
        attempts: 0,
        lastError: null,
        runAt: new Date(),
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      message: "Job queued for manual retry",
      job: updatedJob,
    });
  } catch (error) {
    console.error("Error in POST /api/jobs/:id/retry:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
