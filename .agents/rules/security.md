---
trigger: always_on
---

# Security Rules

## Purpose

Protect user accounts, journal content, uploaded images, exports, and payment-related data.

## Rules

1. Authentication and session handling must use the approved NextAuth/Auth.js architecture.

2. Authorization must be enforced server-side. Never rely on client-side checks for access control.

3. A user may access only their own entries, tags, images, exports, and account data.

4. Never expose authentication secrets, AI provider keys, payment secrets, or storage credentials to the client.

5. Validate and sanitize untrusted input server-side before storage or rendering.

6. Image uploads must be validated server-side before storage:
   - JPEG, PNG, or WebP only.
   - Maximum 10 MB.

7. Export endpoints must verify ownership before generating or serving exported data.

8. Signed image URLs, when used, must be time-limited and valid for at least the required export period.

9. Never log passwords, session secrets, API keys, payment credentials, or full journal content unnecessarily.

10. Do not send journal content to an AI provider in v1.

11. If AI is introduced later, AI transmission must be explicit, server-controlled, and governed by `ai-pipeline.md`.

12. Product copy must never claim that v1 is E2EE or that the service provider cannot access journal content.

13. Account deletion must respect the authoritative 30-day deletion lifecycle.

## Failure Condition

Any unauthorized data exposure, secret exposure, authentication bypass, unsafe upload, or false security claim means the task failed.