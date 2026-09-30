# Journal Entries — Background Job System

A Next.js + PostgreSQL journaling app with a production-grade **background job system** built on top of it. The job system takes slow or unreliable work off the request path, runs it in a separate worker process, survives failures, and keeps evidence of exactly what happened to every job.

**Demo workload:** every job sends a real email through Resend — the kind of work that is genuinely slow and genuinely unreliable (network timeouts, provider outages), which is what forces the system to actually work instead of pretending.

---

## The problem it solves

Some work must not be done in the web request. Sending an email can take seconds and can fail. If the request handler does it inline, the user stares at a spinner and the whole app slows down. If it fails, there is no trace and nobody can retry it.

The job system moves that work into a durable queue:

1. The request handler **only writes a row** and returns `202 Accepted` immediately.
2. A separate worker process claims the row and does the work in the background.
3. If it fails, the system **retries with backoff**, then **dead-letters** it for a human.
4. Every success and failure is **stored as evidence**, so you can prove what happened.

---

## Architecture

```
Browser ── POST /api/jobs ──> enqueueJob() ──> "Job" table (status: pending) ── 202 + jobId
                                                        ^
Worker process (npm run worker) ── poll ────────────────┘
   claimNextJob()  (atomic UPDATE ... FOR UPDATE SKIP LOCKED)
   processClaimedJob() ──> handler (e.g. Resend email) ──> "JobOutput" table
   on failure: attempts+1, lastError, runAt = now + backoff  (or status: dead)
   sweep: recover jobs stuck in "processing" past the timeout
```

### The job record (`prisma/schema.prisma`)

| field | purpose |
|---|---|
| `id` | generated primary key |
| `type` | which handler runs this job |
| `payload` | the input, stored as JSON |
| `status` | DB-enforced enum: `pending`, `processing`, `succeeded`, `failed`, `dead` |
| `attempts` / `maxAttempts` | how many times it has run / the limit (configurable) |
| `lastError` | most recent error message |
| `runAt` | when it may next run (backoff scheduling) |
| `startedAt` / `finishedAt` | timing evidence |
| `idempotencyKey` | unique — the same logical job cannot be created twice |

### The status lifecycle (the part engineers check first)

```
pending ──> processing ──> succeeded
            │
            └─ throws ──> attempts + 1, lastError saved
                          ├─ attempts < maxAttempts ──> pending (runAt = now + backoff)
                          └─ attempts >= maxAttempts ──> dead
```

- **`pending`** — waiting to run.
- **`processing`** — claimed by a worker, running now.
- **`succeeded`** — done; output stored under the job id.
- **`failed`** — the retry state in the enum: an attempt failed but retries remain.
- **`dead`** — retries exhausted. No amount of waiting will run it again; a human reads `lastError` and requeues it. **These two states are deliberately not conflated** — "wait" and "wake a human" are different operations.

---

## How it handles the hard cases

| requirement | implementation |
|---|---|
| Enqueue returns instantly | `POST /api/jobs` writes a `pending` row, returns `202` + job id |
| Idempotency | unique `idempotencyKey` constraint; a duplicate submission returns the existing job |
| Atomic claim | one `UPDATE ... FOR UPDATE SKIP LOCKED` — only one of N workers can win a job |
| Concurrency cap | `JOB_CONCURRENCY` (default 5) — keeps you inside a provider's rate limit |
| Retry backoff | `2^attempts × base + jitter` — failed jobs don't hit the same broken dependency together |
| Idempotent work | before running, the worker checks if output already exists for the job id; if so it skips the work and marks succeeded (a crash after work-but-before-success never double-sends) |
| Stuck jobs | sweep resets `processing` jobs past the timeout to `pending` with an incremented attempt count; cutoff uses the database clock so it is timezone-proof |
| Dead letters | **Dead-Letter Queue** tab lists dead jobs with payload + last error inline and a manual retry button |
| Status polling | `GET /api/jobs/:id` returns status, attempts, lastError, output — the client never stares at a meaningless spinner |

---

## Work: sending email via Resend

`src/lib/jobs/handlers.ts` — `SEND_EMAIL` handler calls the Resend API:

- the provider's `messageId` is stored in `JobOutput` (keyed by `jobId`) as the proof;
- if the provider errors or times out, the handler throws and the retry/backoff/dead machinery takes over;
- thanks to the idempotent-work guard, a retry never sends a second email if the first send already recorded its output.

Requires `RESEND_API_KEY` in `.env` (free tier: 3,000 emails/month). Without a verified domain, send to your own inbox using `onboarding@resend.dev` as the sender.

---

## Running it

```bash
# install
npm install

# database (Postgres) — DATABASE_URL in .env
npx prisma migrate dev   # or: npx prisma migrate deploy && npx prisma generate

# two processes
npm run dev        # web app + API + dashboard (http://localhost:3000)
npm run worker     # background worker process
```

Optional worker configuration (`.env`):
- `JOB_CONCURRENCY` — max jobs at once
- `JOB_PROCESSING_TIMEOUT_MS` — when a `processing` job is considered stuck
- `JOB_POLL_INTERVAL_MS` — queue polling interval
- `JOB_BACKOFF_BASE_MS` — base backoff delay

---

## API

| endpoint | purpose |
|---|---|
| `POST /api/jobs` | enqueue a job (`type`, `payload`, `idempotencyKey`, optional `runAt`/`maxAttempts`) → `202` + jobId |
| `GET /api/jobs` | list jobs (optional `?status=`) |
| `GET /api/jobs/:id` | status, attempts, lastError, output |
| `POST /api/jobs/:id/retry` | manually re-queue a `dead` job (attempts reset) |

## Dashboard

A minimal UI for trigger + status: enqueue a job, watch it flow through states, open the **Dead-Letter Queue** tab as the first place to look when something goes wrong.

## Testing

```bash
# 8-test in-process verification suite
npx tsx tests/verification.ts

# live "break it on purpose" suite — real worker processes, real SIGKILL,
# 50-job concurrency, 100% failure backoff, two workers, idempotency
npx tsx tests/step9-attacks.ts   # results recorded to tests/step9-results.json
```

Both suites pass and cover: concurrency cap, failures → dead, backoff + jitter, stuck-job recovery, idempotency, multi-worker atomic claiming, and idempotent work.

## Evidence

Screenshots for the write-up live in `docs/`:
- `screenshot-1-jobs-table.png` — jobs table with every status
- `screenshot-2-dead-letter.png` — dead letter view
- `screenshot-3-stuck-recovery-before.png` / `...-after.png` — the kill-and-recover story

## Task 2 Review Notes

This project implements a database-backed background job system with retries, exponential backoff, idempotency, stuck-job recovery, and dead-letter handling.