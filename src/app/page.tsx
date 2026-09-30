"use client";

import React, { useState, useEffect, useCallback } from "react";

interface Job {
  id: string;
  type: string;
  payload: any;
  status: "pending" | "processing" | "succeeded" | "failed" | "dead" | string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  output?: any;
}

export default function JobsDashboard() {
  const [activeTab, setActiveTab] = useState<"trigger" | "all" | "dead">("all");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Form states
  const [jobType, setJobType] = useState<string>("TEST_JOB");
  const [payloadText, setPayloadText] = useState<string>('{\n  "message": "Hello background worker"\n}');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(`key-${Date.now()}`);
  const [enqueueResult, setEnqueueResult] = useState<any>(null);
  const [enqueueError, setEnqueueError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const url = activeTab === "dead" ? "/api/jobs?status=dead" : "/api/jobs";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error("Failed to fetch jobs", err);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 1500);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const handleEnqueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnqueueError(null);
    setEnqueueResult(null);

    let parsedPayload = {};
    try {
      if (payloadText.trim()) {
        parsedPayload = JSON.parse(payloadText);
      }
    } catch (err) {
      setEnqueueError("Invalid JSON in payload");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: jobType,
          payload: parsedPayload,
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (res.status === 202) {
        setEnqueueResult(data);
        // Generate a new idempotency key for convenience
        setIdempotencyKey(`key-${Date.now()}`);
        fetchJobs();
      } else {
        setEnqueueError(data.error || "Failed to enqueue job");
      }
    } catch (err: any) {
      setEnqueueError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/retry`, {
        method: "POST",
      });
      if (res.ok) {
        fetchJobs();
        if (selectedJob && selectedJob.id === jobId) {
          fetchJobDetails(jobId);
        }
      }
    } catch (err) {
      console.error("Failed to retry job", err);
    }
  };

  const fetchJobDetails = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedJob(data);
      }
    } catch (err) {
      console.error("Failed to fetch job details", err);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "succeeded":
        return "badge-succeeded";
      case "processing":
        return "badge-processing";
      case "pending":
        return "badge-pending";
      case "dead":
      case "failed":
        return "badge-danger";
      default:
        return "badge-default";
    }
  };

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1>Background Job System</h1>
          <p className="subtitle">Task 2 Execution & Status Dashboard</p>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All Jobs ({jobs.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "dead" ? "active" : ""}`}
          onClick={() => setActiveTab("dead")}
        >
          Dead-Letter Queue ({jobs.filter((j) => j.status === "dead").length})
        </button>
        <button
          className={`tab-btn ${activeTab === "trigger" ? "active" : ""}`}
          onClick={() => setActiveTab("trigger")}
        >
          Enqueue New Job
        </button>
      </nav>

      {activeTab === "trigger" && (
        <section className="card">
          <h2>Enqueue Background Job</h2>
          <form onSubmit={handleEnqueue} className="form">
            <div className="form-group">
              <label htmlFor="jobType">Job Type</label>
              <select
                id="jobType"
                value={jobType}
                onChange={(e) => {
                  const val = e.target.value;
                  setJobType(val);
                  if (val === "FAILING_JOB") {
                    setPayloadText('{\n  "failUntilAttempt": 5,\n  "errorMessage": "Simulated error"\n}');
                  } else if (val === "SEND_EMAIL") {
                    setPayloadText('{\n  "to": "you@example.com",\n  "subject": "Journal digest from the background job system"\n}');
                  } else if (val === "HARD_DELETE_USER") {
                    setPayloadText('{\n  "userId": "usr_12345"\n}');
                  } else {
                    setPayloadText('{\n  "message": "Hello background worker"\n}');
                  }
                }}
                className="input"
              >
                <option value="TEST_JOB">TEST_JOB (Normal processing)</option>
                <option value="SEND_EMAIL">SEND_EMAIL (Real email via Resend)</option>
                <option value="FAILING_JOB">FAILING_JOB (Triggers retry & dead state)</option>
                <option value="HARD_DELETE_USER">HARD_DELETE_USER (Account deletion job)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="idempotencyKey">
                Idempotency Key (Database Enforced)
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  id="idempotencyKey"
                  type="text"
                  value={idempotencyKey}
                  onChange={(e) => setIdempotencyKey(e.target.value)}
                  className="input"
                  style={{ flex: 1 }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setIdempotencyKey(`key-${Date.now()}`)}
                  className="btn-secondary"
                >
                  Generate New
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="payload">Payload (JSON)</label>
              <textarea
                id="payload"
                rows={4}
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                className="input code-font"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Enqueuing..." : "Enqueue Job (HTTP 202)"}
            </button>
          </form>

          {enqueueResult && (
            <div className="alert alert-success" style={{ marginTop: "1rem" }}>
              <strong>HTTP 202 Enqueued:</strong> Job ID: <code>{enqueueResult.jobId}</code>
              {enqueueResult.isDuplicate && (
                <span style={{ display: "block", color: "var(--color-warning)" }}>
                  Notice: Same idempotency key submitted — returned existing job.
                </span>
              )}
            </div>
          )}

          {enqueueError && (
            <div className="alert alert-danger" style={{ marginTop: "1rem" }}>
              Error: {enqueueError}
            </div>
          )}
        </section>
      )}

      {(activeTab === "all" || activeTab === "dead") && (
        <div className="grid">
          <section className="card" style={{ flex: 2 }}>
            <h2>{activeTab === "dead" ? "Dead-Letter Queue" : "Recent Jobs"}</h2>
            {jobs.length === 0 ? (
              <p className="muted" style={{ padding: "1rem 0" }}>
                No jobs found in this view.
              </p>
            ) : (
              <div className="table-responsive">
                <table className="table">
<thead>
                      <tr>
                        <th>Job ID</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Attempts</th>
                        {activeTab === "dead" && (
                          <>
                            <th>Payload</th>
                            <th>Last Error</th>
                          </>
                        )}
                        <th>Actions</th>
                      </tr>
                    </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <code className="code-font">{job.id.substring(0, 12)}...</code>
                        </td>
                        <td>{job.type}</td>
                        <td>
                          <span className={`badge ${getStatusBadgeClass(job.status)}`}>
                            {job.status}
                          </span>
                        </td>
                        <td>
                          {job.attempts} / {job.maxAttempts}
                        </td>
                        {activeTab === "dead" && (
                          <>
                            <td>
                              <pre className="dead-pre">{JSON.stringify(job.payload, null, 2)}</pre>
                            </td>
                            <td>
                              {job.lastError ? (
                                <pre className="dead-pre">{job.lastError}</pre>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                          </>
                        )}
                        <td>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                              onClick={() => fetchJobDetails(job.id)}
                              className="btn-small"
                            >
                              Details
                            </button>
                            {job.status === "dead" && (
                              <button
                                onClick={() => handleRetry(job.id)}
                                className="btn-small btn-retry"
                              >
                                Retry
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {selectedJob && (
            <section className="card" style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2>Job Details</h2>
                <button onClick={() => setSelectedJob(null)} className="btn-small">Close</button>
              </div>
              <div className="details-list">
                <p><strong>ID:</strong> <code className="code-font">{selectedJob.id}</code></p>
                <p><strong>Type:</strong> {selectedJob.type}</p>
                <p>
                  <strong>Status:</strong>{" "}
                  <span className={`badge ${getStatusBadgeClass(selectedJob.status)}`}>
                    {selectedJob.status}
                  </span>
                </p>
                <p><strong>Idempotency Key:</strong> <code>{selectedJob.idempotencyKey}</code></p>
                <p><strong>Attempts:</strong> {selectedJob.attempts} / {selectedJob.maxAttempts}</p>
                <p><strong>Run At:</strong> {new Date(selectedJob.runAt).toLocaleTimeString()}</p>
                {selectedJob.finishedAt && (
                  <p><strong>Finished At:</strong> {new Date(selectedJob.finishedAt).toLocaleTimeString()}</p>
                )}
                {selectedJob.lastError && (
                  <div className="error-box">
                    <strong>Last Error:</strong>
                    <pre>{selectedJob.lastError}</pre>
                  </div>
                )}
                <div>
                  <strong>Payload:</strong>
                  <pre className="code-box">{JSON.stringify(selectedJob.payload, null, 2)}</pre>
                </div>
                {selectedJob.output && (
                  <div>
                    <strong>Idempotent Output:</strong>
                    <pre className="code-box">{JSON.stringify(selectedJob.output, null, 2)}</pre>
                  </div>
                )}
                {selectedJob.status === "dead" && (
                  <button
                    onClick={() => handleRetry(selectedJob.id)}
                    className="btn-primary"
                    style={{ width: "100%", marginTop: "1rem" }}
                  >
                    Manually Re-queue Job
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      <style jsx>{`
        .container {
          max-width: 1100px;
          margin: 0 auto;
          padding: 2rem 1rem;
        }
        .header {
          margin-bottom: 2rem;
          border-bottom: 1px solid var(--color-border);
          padding-bottom: 1rem;
        }
        .subtitle {
          color: var(--color-text-muted);
          margin-top: 0.25rem;
        }
        .tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
        }
        .tab-btn {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text-muted);
          padding: 0.6rem 1.2rem;
          border-radius: 6px;
          font-weight: 500;
        }
        .tab-btn.active {
          background: var(--color-primary);
          color: #ffffff;
          border-color: var(--color-primary);
        }
        .card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
        }
        .grid {
          display: flex;
          gap: 1.5rem;
          flex-wrap: wrap;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          margin-top: 1rem;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .input {
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          color: var(--color-text);
          padding: 0.6rem 0.8rem;
          border-radius: 6px;
          font-size: 0.95rem;
        }
        .code-font {
          font-family: monospace;
        }
        .btn-primary {
          background: var(--color-primary);
          color: #ffffff;
          border: none;
          padding: 0.75rem 1.25rem;
          border-radius: 6px;
          font-weight: 600;
        }
        .btn-secondary {
          background: var(--color-surface-hover);
          color: var(--color-text);
          border: 1px solid var(--color-border);
          padding: 0.6rem 0.8rem;
          border-radius: 6px;
        }
        .btn-small {
          background: var(--color-surface-hover);
          color: var(--color-text);
          border: 1px solid var(--color-border);
          padding: 0.3rem 0.6rem;
          border-radius: 4px;
          font-size: 0.85rem;
        }
        .btn-retry {
          background: var(--color-warning);
          color: #000;
          font-weight: 600;
          border: none;
        }
        .table-responsive {
          overflow-x: auto;
          margin-top: 1rem;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .table th, .table td {
          padding: 0.75rem;
          border-bottom: 1px solid var(--color-border);
        }
        .badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        .badge-pending {
          background: rgba(99, 102, 241, 0.2);
          color: #818cf8;
        }
        .badge-processing {
          background: rgba(245, 158, 11, 0.2);
          color: #fbbf24;
        }
        .badge-succeeded {
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
        }
        .badge-danger {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
        }
        .details-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-top: 1rem;
          font-size: 0.9rem;
        }
        .code-box {
          background: var(--color-bg);
          padding: 0.5rem;
          border-radius: 4px;
          overflow-x: auto;
          font-size: 0.85rem;
          margin-top: 0.25rem;
        }
        .error-box {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid var(--color-danger);
          padding: 0.5rem;
          border-radius: 4px;
          color: #f87171;
        }
        .alert {
          padding: 0.75rem 1rem;
          border-radius: 6px;
        }
        .alert-success {
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid var(--color-success);
          color: #34d399;
        }
        .alert-danger {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid var(--color-danger);
          color: #f87171;
        }
        .dead-pre {
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 4px;
          padding: 0.35rem 0.5rem;
          margin: 0;
          max-width: 220px;
          max-height: 90px;
          overflow: auto;
          font-size: 0.75rem;
          font-family: monospace;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .muted {
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}
