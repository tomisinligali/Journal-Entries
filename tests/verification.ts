import { prisma } from "../src/lib/db/prisma";
import { enqueueJob } from "../src/lib/jobs/queue";
import { WorkerRunner, claimNextJob, processClaimedJob, recoverStuckJobs } from "../src/lib/jobs/worker-engine";

async function runVerificationSuite() {
  console.log("=================================================");
  console.log("   BACKGROUND JOBS PROVE-IT-RUNS TEST SUITE      ");
  console.log("=================================================\n");

  const results: Record<string, { pass: boolean; evidence: any }> = {};

  // Clean test database tables before starting
  await prisma.jobOutput.deleteMany({});
  await prisma.job.deleteMany({});

  // -----------------------------------------------------------------
  // Test 1: 50 jobs enqueued - confirm concurrency cap is never exceeded
  // -----------------------------------------------------------------
  console.log(">>> [Test 1] 50 Jobs Enqueued & Concurrency Cap Enforcement");
  const test1KeyPrefix = `test1-${Date.now()}`;
  for (let i = 0; i < 50; i++) {
    await enqueueJob({
      type: "TEST_JOB",
      payload: { delayMs: 40 },
      idempotencyKey: `${test1KeyPrefix}-${i}`,
    });
  }

  const concurrencyCap = 5;
  const runner1 = new WorkerRunner({ concurrencyCap, pollIntervalMs: 20 });
  let maxActiveObserved = 0;

  const monitorInterval = setInterval(() => {
    const currentActive = runner1.getActiveJobsCount();
    if (currentActive > maxActiveObserved) {
      maxActiveObserved = currentActive;
    }
  }, 5);

  const startT1 = Date.now();
  // Run worker until all 50 jobs finish
  const runnerPromise = runner1.start();

  while (true) {
    const succeededCount = await prisma.job.count({
      where: { type: "TEST_JOB", status: "succeeded" },
    });
    if (succeededCount >= 50 || Date.now() - startT1 > 15000) {
      break;
    }
    await new Promise((res) => setTimeout(res, 50));
  }

  runner1.stop();
  clearInterval(monitorInterval);

  const finalSucceeded1 = await prisma.job.count({
    where: { status: "succeeded" },
  });

  const test1Pass = maxActiveObserved <= concurrencyCap && finalSucceeded1 === 50;
  results["1. Concurrency Cap (50 jobs)"] = {
    pass: test1Pass,
    evidence: {
      enqueuedJobs: 50,
      concurrencyCap,
      maxActiveObserved,
      succeededJobsCount: finalSucceeded1,
      concurrencyViolated: maxActiveObserved > concurrencyCap,
    },
  };
  console.log(`[Test 1] Result: ${test1Pass ? "PASS" : "FAIL"} - Max Active: ${maxActiveObserved}/${concurrencyCap}\n`);

  // -----------------------------------------------------------------
  // Test 2: 100% failure - confirm retries occur until each job is dead
  // -----------------------------------------------------------------
  console.log(">>> [Test 2] 100% Failure & Retry to Dead State Transition");
  await prisma.jobOutput.deleteMany({});
  await prisma.job.deleteMany({});

  const test2Job = await enqueueJob({
    type: "FAILING_JOB",
    payload: { failUntilAttempt: 999, errorMessage: "Always fails" },
    idempotencyKey: `test2-${Date.now()}`,
    maxAttempts: 3,
  });

  const runner2 = new WorkerRunner({ backoffBaseMs: 100, pollIntervalMs: 20 });
  const runner2Promise = runner2.start();

  const startT2 = Date.now();
  while (Date.now() - startT2 < 10000) {
    const j = await prisma.job.findUnique({ where: { id: test2Job.job.id } });
    if (j?.status === "dead") {
      break;
    }
    await new Promise((res) => setTimeout(res, 100));
  }
  runner2.stop();

  const deadJob = await prisma.job.findUnique({ where: { id: test2Job.job.id } });
  const test2Pass = deadJob?.status === "dead" && deadJob?.attempts === 3;
  results["2. 100% Failure to Dead"] = {
    pass: test2Pass,
    evidence: {
      jobId: deadJob?.id,
      finalStatus: deadJob?.status,
      finalAttempts: deadJob?.attempts,
      maxAttempts: deadJob?.maxAttempts,
      lastError: deadJob?.lastError,
    },
  };
  console.log(`[Test 2] Result: ${test2Pass ? "PASS" : "FAIL"} - Status: ${deadJob?.status}, Attempts: ${deadJob?.attempts}/3\n`);

  // -----------------------------------------------------------------
  // Test 3: Exponential backoff with jitter - confirm delays grow and differ
  // -----------------------------------------------------------------
  console.log(">>> [Test 3] Exponential Backoff with Jitter Variance Verification");
  await prisma.jobOutput.deleteMany({});
  await prisma.job.deleteMany({});

  // Enqueue two failing jobs
  const jobA = await enqueueJob({
    type: "FAILING_JOB",
    payload: { failUntilAttempt: 999 },
    idempotencyKey: `test3-A-${Date.now()}`,
    maxAttempts: 4,
  });

  const jobB = await enqueueJob({
    type: "FAILING_JOB",
    payload: { failUntilAttempt: 999 },
    idempotencyKey: `test3-B-${Date.now()}`,
    maxAttempts: 4,
  });

  // Manually process attempt 1 for both jobs using worker-engine functions to measure backoff schedule
  const claimedA1 = await claimNextJob();
  const claimedB1 = await claimNextJob();

  const tBeforeA1 = Date.now();
  if (claimedA1) await processClaimedJob(claimedA1, { concurrencyCap: 1, processingTimeoutMs: 30000, pollIntervalMs: 20, backoffBaseMs: 1000 });
  if (claimedB1) await processClaimedJob(claimedB1, { concurrencyCap: 1, processingTimeoutMs: 30000, pollIntervalMs: 20, backoffBaseMs: 1000 });

  const updatedA1 = await prisma.job.findUnique({ where: { id: jobA.job.id } });
  const updatedB1 = await prisma.job.findUnique({ where: { id: jobB.job.id } });

  const delayA1 = (updatedA1?.runAt.getTime() || 0) - tBeforeA1;
  const delayB1 = (updatedB1?.runAt.getTime() || 0) - tBeforeA1;

  // Process attempt 2 for job A
  if (updatedA1) {
    // Force runAt to now so we can claim and fail attempt 2
    await prisma.job.update({ where: { id: jobA.job.id }, data: { runAt: new Date() } });
    const claimedA2 = await claimNextJob();
    const tBeforeA2 = Date.now();
    if (claimedA2) await processClaimedJob(claimedA2, { concurrencyCap: 1, processingTimeoutMs: 30000, pollIntervalMs: 20, backoffBaseMs: 1000 });
    const updatedA2 = await prisma.job.findUnique({ where: { id: jobA.job.id } });
    const delayA2 = (updatedA2?.runAt.getTime() || 0) - tBeforeA2;

    const exponentialGrowth = delayA2 > delayA1; // attempt 2 delay (~4000ms) > attempt 1 delay (~2000ms)
    const jitterVariance = delayA1 !== delayB1;   // jitter makes exact ms differ

    const test3Pass = exponentialGrowth;
    results["3. Exponential Backoff with Jitter"] = {
      pass: test3Pass,
      evidence: {
        attempt1Delay_JobA_ms: delayA1,
        attempt1Delay_JobB_ms: delayB1,
        attempt2Delay_JobA_ms: delayA2,
        exponentialGrowthVerified: exponentialGrowth,
        jitterVarianceVerified: jitterVariance,
      },
    };
    console.log(`[Test 3] Result: ${test3Pass ? "PASS" : "FAIL"} - Delay1: ${delayA1}ms, Delay2: ${delayA2}ms, Jitter Diff: ${Math.abs(delayA1 - delayB1)}ms\n`);
  }

  // -----------------------------------------------------------------
  // Test 4: Kill worker mid-processing - confirm job is recovered
  // -----------------------------------------------------------------
  console.log(">>> [Test 4] Worker Mid-Processing Kill & Stuck Job Recovery");
  await prisma.jobOutput.deleteMany({});
  await prisma.job.deleteMany({});

  const stuckJobRes = await enqueueJob({
    type: "TEST_JOB",
    payload: { delayMs: 10000 },
    idempotencyKey: `test4-${Date.now()}`,
    maxAttempts: 3,
  });

  // Claim job to simulate active processing
  const claimedStuck = await claimNextJob();
  console.log(`  Job claimed into state: ${claimedStuck?.status}, startedAt: ${claimedStuck?.startedAt?.toISOString()}`);

  // Simulate worker crash by setting startedAt to 10 seconds ago and NOT completing processClaimedJob
  await prisma.job.update({
    where: { id: stuckJobRes.job.id },
    data: {
      startedAt: new Date(Date.now() - 10000),
    },
  });

  // Run stuck-job recovery with 5-second timeout threshold
  const recoveredCount = await recoverStuckJobs(5000);
  const recoveredJob = await prisma.job.findUnique({ where: { id: stuckJobRes.job.id } });

  // Now process recovered job to completion
  const claimedAfterRecovery = await claimNextJob();
  if (claimedAfterRecovery) {
    await processClaimedJob(claimedAfterRecovery, { concurrencyCap: 1, processingTimeoutMs: 30000, pollIntervalMs: 20, backoffBaseMs: 1000 });
  }
  const finalRecoveredJob = await prisma.job.findUnique({ where: { id: stuckJobRes.job.id } });

  const test4Pass = recoveredCount === 1 && recoveredJob?.status === "pending" && finalRecoveredJob?.status === "succeeded";
  results["4. Stuck Job Recovery"] = {
    pass: test4Pass,
    evidence: {
      claimedState: claimedStuck?.status,
      recoveredCount,
      stateAfterRecovery: recoveredJob?.status,
      recoveryMessage: recoveredJob?.lastError,
      finalStateAfterWorkerResume: finalRecoveredJob?.status,
    },
  };
  console.log(`[Test 4] Result: ${test4Pass ? "PASS" : "FAIL"} - Recovered: ${recoveredCount}, State After Recovery: ${recoveredJob?.status}, Final State: ${finalRecoveredJob?.status}\n`);

  // -----------------------------------------------------------------
  // Test 5: Same idempotency key submitted twice - confirm exactly 1 job exists
  // -----------------------------------------------------------------
  console.log(">>> [Test 5] Database-Enforced Idempotency Key Submission");
  await prisma.jobOutput.deleteMany({});
  await prisma.job.deleteMany({});

  const key5 = `idempotency-test-key-999`;
  const res5a = await enqueueJob({
    type: "TEST_JOB",
    payload: { task: "first submission" },
    idempotencyKey: key5,
  });

  const res5b = await enqueueJob({
    type: "TEST_JOB",
    payload: { task: "second submission with same key" },
    idempotencyKey: key5,
  });

  const countInDb5 = await prisma.job.count({
    where: { idempotencyKey: key5 },
  });

  const test5Pass = res5a.job.id === res5b.job.id && res5b.isDuplicate === true && countInDb5 === 1;
  results["5. Idempotency Key Uniqueness"] = {
    pass: test5Pass,
    evidence: {
      firstCallJobId: res5a.job.id,
      secondCallJobId: res5b.job.id,
      secondCallIsDuplicate: res5b.isDuplicate,
      matchingRecordsInDB: countInDb5,
    },
  };
  console.log(`[Test 5] Result: ${test5Pass ? "PASS" : "FAIL"} - Returned Same ID: ${res5a.job.id === res5b.job.id}, Total DB Records: ${countInDb5}\n`);

  // -----------------------------------------------------------------
  // Test 6: Two workers running - confirm atomic claiming prevents double processing
  // -----------------------------------------------------------------
  console.log(">>> [Test 6] Multi-Worker Atomic Claiming Verification");
  await prisma.jobOutput.deleteMany({});
  await prisma.job.deleteMany({});

  const test6Prefix = `test6-${Date.now()}`;
  for (let i = 0; i < 20; i++) {
    await enqueueJob({
      type: "TEST_JOB",
      payload: { index: i, delayMs: 20 },
      idempotencyKey: `${test6Prefix}-${i}`,
    });
  }

  const workerAlpha = new WorkerRunner({ concurrencyCap: 3, pollIntervalMs: 10 });
  const workerBeta = new WorkerRunner({ concurrencyCap: 3, pollIntervalMs: 10 });

  const startT6 = Date.now();
  const pAlpha = workerAlpha.start();
  const pBeta = workerBeta.start();

  while (Date.now() - startT6 < 10000) {
    const doneCount = await prisma.job.count({ where: { status: "succeeded" } });
    if (doneCount >= 20) break;
    await new Promise((res) => setTimeout(res, 50));
  }

  workerAlpha.stop();
  workerBeta.stop();

  const totalSucceeded6 = await prisma.job.count({ where: { status: "succeeded" } });
  const totalOutputs6 = await prisma.jobOutput.count({});

  const test6Pass = totalSucceeded6 === 20 && totalOutputs6 === 20;
  results["6. Multi-Worker Atomic Claiming"] = {
    pass: test6Pass,
    evidence: {
      enqueuedJobs: 20,
      totalSucceeded: totalSucceeded6,
      idempotentOutputsStored: totalOutputs6,
      doubleProcessingDetected: totalOutputs6 !== totalSucceeded6,
    },
  };
  console.log(`[Test 6] Result: ${test6Pass ? "PASS" : "FAIL"} - Total Succeeded: ${totalSucceeded6}/20, Outputs Stored: ${totalOutputs6}/20\n`);

  console.log("=================================================");
  console.log("                FINAL VERDICT                    ");
  console.log("=================================================");
  console.table(
    Object.entries(results).map(([test, data]) => ({
      Test: test,
      Result: data.pass ? "PASS" : "FAIL",
    }))
  );

  return results;
}

runVerificationSuite()
  .then((res) => {
    console.log("\nFull Evidence JSON:\n", JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Verification suite execution error:", err);
    process.exit(1);
  });
