# **AGENTS.md**

## **1\. What is this project?**

This application contains a single-user journaling web application for adults who want a fast, focused way to write, organize, retrieve, export, and eventually retain their personal journal history.

The product is being built against the **v1 PRD** as the source of truth for product scope and business requirements.

The PRD defines **what** the product must do. This file defines **how the coding agent must behave while building it**.

### **Source of truth**

Follow this precedence order:

1. **This `AGENTS.md`** — engineering behavior, architecture constraints, locked implementation choices, safety rules, and development process.  
2. **The current PRD** — product requirements, scope, business rules, acceptance criteria, phases, and success metrics.  
3. Existing repository code and configuration — preserve established patterns unless they conflict with this file or the PRD.  
4. Agent judgment — use only where the above sources leave an implementation detail genuinely unspecified.

Never use agent preference to override a locked requirement.

### **Current product scope**

Build **v1 only** unless a task explicitly promotes later functionality.

The v1 product is:

* Single-user and access-controlled.  
* Not end-to-end encrypted.  
* Focused on journal writing and retrieval.  
* Built around reliable autosave.  
* Organized through dates and tags.  
* Searchable through PostgreSQL full-text search.  
* Capable of image attachments.  
* Capable of JSON and PDF export according to the PRD.  
* Equipped with opt-in email reminders.  
* Instrumented for WAW, 30-day retention, and entries-per-active-user-per-week.  
* Explicitly **without AI processing of journal content**.

Do not interpret the PRD's future possibilities or Open Questions as permission to implement those capabilities now.

---

# **2\. What is locked?**

The following decisions are locked.

If a task would be easier with another technology, architecture, provider, library, database, or service, **do not replace the locked choice**.

Do not "upgrade," "improve," substitute, or migrate a locked technology without an explicit change to the project requirements.

## **2.1 Application and authentication**

* Build the product as the approved web application architecture defined by the project.  
* Use **NextAuth/Auth.js** for authentication.  
* Support:  
  * Email/password authentication.  
  * Google OAuth.  
  * Password reset.  
  * Secure session management.  
  * Sign out.  
* Do not replace NextAuth/Auth.js with another authentication provider or framework.

## **2.2 Database and persistence**

* Use **PostgreSQL** as the persistence layer.  
* Use **Prisma** for the application data model and database access where the existing project architecture uses Prisma.  
* Do not replace PostgreSQL with another database.  
* Do not introduce a second primary database merely because a feature could be implemented differently.  
* Use PostgreSQL-native capabilities where the PRD explicitly requires them.

## **2.3 Full-text search**

Search is locked to:

* PostgreSQL `tsvector`.  
* PostgreSQL GIN indexing.  
* PostgreSQL `ts_rank`.  
* A **PostgreSQL trigger** maintaining the `tsvector`.

Never maintain the authoritative search vector solely through application-level writes.

Never silently replace PostgreSQL full-text search with Elasticsearch, Algolia, Meilisearch, vector search, or another search service.

## **2.4 Payments**

**Flutterwave is the locked payment provider.**

If payment or monetization functionality is implemented:

* Use **Flutterwave**.  
* Do not substitute Stripe, Paystack, Paddle, Lemon Squeezy, or another payment provider.  
* Keep payment-provider integration behind a clean application boundary so the rest of the product does not become tightly coupled to Flutterwave-specific implementation details.  
* Never expose Flutterwave secret credentials to the client.  
* Never trust client-provided payment-success claims as proof of payment.  
* Verify payment state through the server/provider integration before granting paid functionality.

The PRD's current product direction is to avoid gating the core journaling habit behind a hard entry-count limit. Do not invent paid features or pricing rules that are not specified by the PRD or an explicit task.

## **2.5 Image constraints**

Images are locked to:

* JPEG.  
* PNG.  
* WebP.  
* Maximum **10 MB per image**.

Server-side validation is mandatory.

Client-side validation is only a user-experience enhancement and is never the security boundary.

## **2.6 Security posture**

v1 is **not E2EE**.

The product is:

> Single-user and access-controlled by default.

Entries are protected through application authorization and encryption at rest and in transit.

Never describe the product as if the service provider is cryptographically unable to access stored journal content.

Do not implement an E2EE architecture as part of v1.

Do not implement AI processing of journal content in v1.

---

# **3\. What must never happen?**

Breaking any rule in this section means the task **failed**, even if:

* The application builds.  
* The feature appears to work.  
* Tests pass.  
* The UI looks correct.  
* The implementation is technically elegant.

Business correctness, data correctness, security correctness, and architectural correctness are part of the definition of success.

## **3.1 Scope violations**

### **Never implement future scope without authorization**

Build only the phase and task currently being requested.

Do not pull Phase 2 features into Phase 1 because they appear easy or useful.

In particular, do not independently introduce:

* AI summaries.  
* AI sentiment analysis.  
* AI recommendations.  
* AI processing of journal content.  
* E2EE.  
* Social sharing.  
* Public profiles.  
* Collaborative editing.  
* OCR.  
* Image-content search.  
* Commercial-grade search infrastructure.  
* Unrequested monetization features.

An Open Question is **not** an implementation requirement.

A future feature mentioned in the PRD is not permission to build it early.

---

## **3.2 User isolation**

A user must only be able to access their own:

* Journal entries.  
* Tags.  
* Images.  
* Exports.  
* Account data.  
* Other user-owned resources.

Every server-side read, write, update, delete, export, and attachment operation must enforce ownership.

Never rely on the client to enforce ownership.

Never accept a user/resource identifier from the client and assume that it is authorized.

Always authorize the requested resource against the authenticated user on the server.

A feature that works but permits cross-user data access is a failed implementation.

**PRD reference:** Technical Requirements, Application Architecture.

---

## **3.3 Privacy and security claims**

Never claim or imply that v1 is end-to-end encrypted.

Never claim that the service provider is technically incapable of reading stored journal content.

Do not add UI copy that makes a stronger security promise than the architecture provides.

The security model must remain accurately described as **single-user and access-controlled, not E2EE**.

**PRD reference:** Product Summary, Personas, Assumptions.

---

## **3.4 Account deletion**

Account deletion has **one authoritative 30-day clock**.

Start that clock when the user requests account deletion.

Never create independent hard-delete clocks for individual entries or other user-owned data.

When account deletion is requested:

* Apply the deletion state to the user's entries.  
* Override any independent entry-level soft-delete recovery timing.  
* Treat the account-level deadline as the authoritative deadline for the user's data.  
* Keep recoverable data available during the defined recovery period.  
* Permanently delete eligible user-owned data after the 30-day deadline.

Do not implement a system where entries can survive beyond the account's deletion deadline because they have their own later timer.

Do not immediately hard-delete recoverable user-owned data merely because account deletion was requested.

The scheduled hard-delete process operates from the **User-level deletion lifecycle**.

**PRD reference:** Functional Requirements 7–12; Prisma Data Model; Definition of Done.

---

## **3.5 Hard-delete job**

The hard-delete process must be:

* Idempotent.  
* Run daily.  
* Logged on every execution.  
* Monitored.  
* Alerting when it fails to run.  
* Alerting when it fails to complete for an eligible account.

The system must expose monitoring capable of showing accounts that have passed their 30-day deletion deadline but remain awaiting hard deletion.

Never write a deletion job that assumes it will run exactly once.

Never make the job unsafe to retry.

Never silently swallow deletion failures.

**PRD reference:** Risks, Risk 3; Definition of Done.

---

## **3.6 Tags**

Normalize tag names at the application layer **before uniqueness checks**.

Normalization must:

1. Trim leading and trailing whitespace.  
2. Convert the tag name to lowercase.

A user must not be able to create two normalized tags with the same name.

Do not allow:

* `Work`  
* `work`  
* `work`

to become three separate normalized tags for the same user.

Maintain the uniqueness constraint equivalent to:

@@unique(\[userId, name\])

Do not rely on the database constraint alone to perform normalization.

**PRD reference:** Functional Requirements 17–21; Prisma Data Model.

---

## **3.7 Tag filtering**

Multiple selected tags use **AND semantics**.

An entry matches only when it contains **every selected tag**.

Do not implement OR semantics.

When cursor pagination is combined with multiple-tag AND filtering, use the specified query strategy:

1. Pre-select matching `entryId`s.  
2. Group by entry ID.  
3. Use `HAVING COUNT(DISTINCT tagId) = number of selected tags`.  
4. Cursor-paginate over the resulting filtered entry ID set.

Do not invent a different strategy independently for different screens or endpoints.

**PRD reference:** Functional Requirements 20–21 and 36–38.

---

## **3.8 Image uploads**

Before writing an image to storage, validate it server-side.

Reject images that:

* Exceed 10 MB.  
* Are not JPEG, PNG, or WebP.

Never treat client-side validation as sufficient.

Never trust a client-supplied MIME type without server-side validation appropriate to the storage pipeline.

Do not allow unsupported image types to reach permanent storage.

**PRD reference:** Functional Requirements 24–29; Technical Requirements 9–10.

---

## **3.9 Image search**

Do not OCR images in v1.

Do not make image contents searchable in v1.

Image attachments are separate from journal-text full-text search.

**PRD reference:** Functional Requirements 29 and 35; Non-Goals.

---

## **3.10 Search-index integrity**

The authoritative `tsvector` must be maintained by a **PostgreSQL trigger**.

Never make application-level writes the sole mechanism responsible for keeping the search vector current.

The implementation must remain correct if an entry is modified through another legitimate database write path.

Use a GIN index.

Use PostgreSQL `ts_rank` for initial result ordering.

Do not promise commercial-grade search relevance.

Treat ranking quality as a known v1 limitation.

Do not replace the search implementation with another search system without an explicit product/architecture decision.

**PRD reference:** Functional Requirements 30–35; Technical Requirements 4–7.

---

## **3.11 Autosave**

Entries must autosave automatically.

The first autosave must occur no later than **5 seconds after the relevant client-side autosave cycle begins**, subject to network/service availability.

The performance target for the authenticated returning-user flow is:

> New Entry click → first character autosaved in under 7 seconds.

This consists of:

* Up to 2 seconds for editor loading.  
* Up to 5 seconds until the first autosave.

Do not claim the target is met without instrumentation.

**PRD reference:** Goal 1; Functional Requirements 13–16; Definition of Done.

---

## **3.12 Analytics**

Instrument the application so the success metrics can be computed without manual database pulls.

Emit an analytics event for every successful journal entry create/edit containing at least:

* `userId`.  
* Timestamp.  
* Event identity/type sufficient to distinguish the qualifying writing action.

The event data must be queryable.

The instrumentation must support calculation of:

* Weekly Active Writers.  
* 30-day retention.  
* Median entries per active user per week.

Do not implement product analytics as an afterthought after the feature is complete.

**PRD reference:** Technical Requirements; Success Metrics.

---

## **3.13 Success metrics**

Do not treat WAW or 30-day retention as sufficient evidence of product success.

WAW and 30-day retention are binary/lagging reporting metrics.

The leading behavioral signal is:

> Median entries per active user per week.

The Habit Builder target is **3+ entries per week**.

Do not manipulate event definitions to artificially inflate activity or retention.

**PRD reference:** Success Metrics.

---

## **3.14 Export integrity**

JSON export must include:

* All journal entries.  
* Associated metadata.  
* Image metadata.  
* Either embedded base64 image data or signed, time-limited image download URLs.

If signed URLs are used, they must remain valid for **at least 7 days after export**.

PDF export must embed attached images inline.

Never produce an export that silently omits a user's attached images.

Never claim that an export contains all journal data if required image data has been excluded.

**PRD reference:** Functional Requirements 39–44; Assumptions.

---

## **3.15 Reminders**

Opt-in email reminders are part of Phase 1\.

Users must be able to opt in or opt out.

Reminders must not be mandatory for using the journal.

Do not make reminder delivery a prerequisite for creating or editing entries.

Do not send reminders to users who have opted out.

**PRD reference:** Functional Requirements 45–47; Phase 1a; Risk 6\.

---

## **3.16 AI**

Do not send journal content to an AI provider in v1.

Do not build AI summaries, sentiment analysis, recommendations, embeddings, or other AI processing of journal entries unless explicitly promoted into scope.

The architecture must not quietly introduce an AI dependency under another feature name.

**PRD reference:** AI Processing Pipeline; Non-Goals.

---

## **3.17 E2EE**

Do not implement E2EE in v1.

Do not design a future E2EE decision into the current product in a way that changes v1 behavior without authorization.

If discussing future E2EE, recognize that it affects:

* Search.  
* Export.  
* Password/account recovery.  
* AI processing.  
* Server-side processing.

The password-reset/E2EE question has **no independent default**. It is gated on the future E2EE decision and must be resolved together with that decision.

**PRD reference:** Open Questions 2–3.

---

## **3.18 Monetization**

Do not introduce a hard entry-count cap merely because monetization is desired.

The PRD explicitly identifies a hard 100-entry cap as conflicting with the Habit Builder's retention objective.

If monetization is implemented, prefer gating storage, export, or convenience functionality rather than blocking the core journaling habit.

Do not invent pricing, subscription tiers, entitlement rules, or paid features that have not been explicitly specified.

When payment functionality is requested, use **Flutterwave**.

**PRD reference:** Business Model; Assumptions; Open Question 5\.

---

## **3.19 Database lifecycle behavior**

Do not use immediate hard-cascade behavior for user-owned data that must remain recoverable during the 30-day account deletion window.

In particular, tags must remain recoverable during the deletion period and must be cleaned up by the scheduled hard-delete process rather than disappearing immediately when the account enters deletion.

`Tag` and `Image` must have `updatedAt` timestamps using Prisma's automatic update behavior.

**PRD reference:** Prisma Data Model.

---

# **4\. How is the work arranged?**

Use a clear feature-oriented structure. Do not create a single giant file, generic utility dump, or tightly coupled spaghetti architecture.

The exact existing repository structure takes precedence where it is already established and compliant with this file.

For a new or reorganized application, use this general structure:

/  
├── AGENTS.md  
├── PRD.md  
├── package.json  
├── prisma/  
│   ├── schema.prisma  
│   ├── migrations/  
│   └── seed/  
│  
├── public/  
│  
├── src/  
│   ├── app/  
│   │   ├── (auth)/  
│   │   ├── (app)/  
│   │   ├── api/  
│   │   └── ...  
│   │  
│   ├── components/  
│   │   ├── ui/  
│   │   ├── journal/  
│   │   ├── entries/  
│   │   ├── tags/  
│   │   ├── calendar/  
│   │   ├── search/  
│   │   ├── export/  
│   │   └── reminders/  
│   │  
│   ├── features/  
│   │   ├── auth/  
│   │   ├── entries/  
│   │   ├── tags/  
│   │   ├── search/  
│   │   ├── images/  
│   │   ├── export/  
│   │   ├── reminders/  
│   │   ├── deletion/  
│   │   ├── analytics/  
│   │   └── payments/  
│   │  
│   ├── lib/  
│   │   ├── auth/  
│   │   ├── db/  
│   │   ├── storage/  
│   │   ├── analytics/  
│   │   ├── email/  
│   │   ├── payments/  
│   │   └── validation/  
│   │  
│   ├── server/  
│   │   ├── services/  
│   │   ├── repositories/  
│   │   └── jobs/  
│   │  
│   ├── types/  
│   └── ...  
│  
├── tests/  
│   ├── unit/  
│   ├── integration/  
│   └── e2e/  
│  
└── ...

### **Architecture boundaries**

Keep these concerns separated:

* UI components must not contain database access.  
* Client components must not contain server secrets.  
* API/server handlers must perform authorization.  
* Database access must remain behind an understandable server-side boundary.  
* Payment provider code must remain behind the payment integration boundary.  
* Email delivery must remain behind the email boundary.  
* Storage provider code must remain behind the storage boundary.  
* Analytics implementation must remain behind the analytics boundary.  
* Scheduled deletion logic must remain isolated from ordinary request/response handlers.  
* PostgreSQL trigger definitions must live with database migrations rather than being hidden inside arbitrary application code.

Do not introduce circular dependencies.

Do not allow feature modules to reach arbitrarily into unrelated feature internals.

Prefer explicit service interfaces over cross-feature implementation leakage.

---

# **5\. How should the code look?**

Write code that is **clean, readable, modern, maintainable, and production-oriented**.

## **5.1 General coding style**

* Prefer small, focused modules.  
* Use descriptive names.  
* Keep functions short enough to understand locally.  
* Keep business rules explicit.  
* Avoid clever abstractions that hide important behavior.  
* Prefer straightforward code over premature abstraction.  
* Remove dead code.  
* Do not leave commented-out implementations behind.  
* Do not duplicate business-critical rules across multiple unrelated locations.  
* Centralize validation and authorization rules where appropriate.  
* Keep side effects explicit.  
* Handle errors intentionally.  
* Never silently swallow errors.

## **5.2 Type safety**

Use strong typing throughout the application.

Avoid:

any

unless there is a documented and unavoidable boundary requiring it.

Prefer explicit domain types and validated inputs.

Do not trust unvalidated external input.

Validate:

* API inputs.  
* Authentication-related inputs.  
* Image uploads.  
* Payment callbacks/webhooks.  
* Export parameters.  
* Resource identifiers.  
* User-controlled filters.

## **5.3 Validation**

Perform security-sensitive validation on the server.

Client validation exists for usability.

Server validation exists for correctness and security.

Never assume the client followed the rules.

## **5.4 Authorization**

Authorization should happen close to the server-side resource access.

Do not fetch a resource first and only later decide whether the user is allowed to see it when the query can safely enforce ownership directly.

Prefer queries that naturally scope resources to the authenticated user.

## **5.5 Database code**

Use Prisma for normal application data access where appropriate.

Use raw SQL/migrations when PostgreSQL-specific functionality is required, particularly:

* `tsvector`.  
* GIN indexes.  
* Search triggers.  
* The specified multi-tag filtering query strategy.

Document non-obvious PostgreSQL behavior in the migration or adjacent code.

Do not move database-critical behavior into fragile application-only logic when the PRD explicitly requires database enforcement.

## **5.6 Prisma model conventions**

Follow the PRD's data-model rules.

At minimum, preserve:

* User deletion lifecycle fields.  
* Entry soft-delete state.  
* Entry ownership.  
* Entry search vector.  
* Tag normalized naming.  
* `@@unique([userId, name])`.  
* Tag `updatedAt DateTime @updatedAt`.  
* Image `updatedAt DateTime @updatedAt`.  
* Image `sizeBytes`.  
* Image MIME/type metadata.  
* Correct deletion lifecycle semantics.

Do not casually rename or restructure these concepts because another schema shape looks cleaner.

## **5.7 Performance**

Respect the product's explicit performance targets.

For the New Entry flow:

* Keep editor loading within the 2-second target.  
* Keep first autosave within the 5-second target.  
* Instrument the complete flow so the 7-second goal can be measured.

Do not add unnecessary network requests to the critical writing path.

Do not perform expensive work synchronously in the request path when it can safely be deferred.

## **5.8 Background work**

Use server-side scheduled/background processing for work that should not block interactive requests, including the account hard-delete process.

The hard-delete job must be safe to retry.

Do not implement destructive scheduled operations as non-idempotent one-shot logic.

## **5.9 Payments**

When implementing Flutterwave:

* Keep provider credentials server-side.  
* Keep provider-specific code isolated.  
* Validate webhook/callback authenticity according to Flutterwave's integration requirements.  
* Treat provider responses as untrusted until verified.  
* Make entitlement changes idempotent.  
* Never grant paid access solely because a browser says payment succeeded.  
* Never put secret keys in client bundles, public environment variables, or source code.

Do not implement a payment flow until the requested task actually requires it.

## **5.10 Secrets and configuration**

Never hard-code:

* API keys.  
* OAuth secrets.  
* Database credentials.  
* Flutterwave secret keys.  
* Email credentials.  
* Storage credentials.  
* Encryption secrets.

Use environment configuration appropriate to the project.

Never commit real secrets.

Never print secrets in logs.

## **5.11 Logging**

Logs must be useful without exposing sensitive journal content or credentials.

Never log:

* Full journal entries unnecessarily.  
* Passwords.  
* OAuth secrets.  
* Payment secrets.  
* Session secrets.  
* Private storage credentials.

For deletion and payment workflows, prefer structured operational events that allow failures to be diagnosed without leaking sensitive data.

## **5.12 Testing**

When changing business-critical functionality, add or update tests.

Prioritize tests for:

* Authentication and authorization.  
* User ownership boundaries.  
* Account deletion and recovery.  
* The single 30-day deletion clock.  
* Hard-delete idempotency.  
* Tag normalization.  
* Tag uniqueness.  
* Multi-tag AND filtering.  
* Cursor pagination.  
* Image validation.  
* Search behavior.  
* Search-trigger integrity.  
* Autosave.  
* Export completeness.  
* Reminder opt-in/opt-out.  
* Analytics events.  
* Payment verification and idempotency when payment code exists.

Do not consider a feature complete merely because the happy path works.

## **5.13 Dependencies and versions**

Use modern, stable dependencies appropriate to the repository.

Prefer **LTS/stable releases** over experimental, nightly, beta, or unnecessarily cutting-edge versions.

Do not upgrade major dependencies casually.

Before changing a major dependency, verify that:

* It is compatible with the existing stack.  
* It does not violate a locked technology choice.  
* It does not change authentication, database, payment, or security behavior unexpectedly.  
* The resulting application still builds and tests successfully.

Do not perform dependency upgrades unrelated to the requested task merely to make the project "more modern."

---

# **6\. What counts as done?**

A task is not done merely because the requested screen exists or the code compiles locally.

A task is done only when:

1. The requested feature is implemented.  
2. The implementation follows this `AGENTS.md`.  
3. The implementation follows the applicable PRD requirements.  
4. No locked technology has been replaced.  
5. No protected business rule has been violated.  
6. Authorization and ownership rules are enforced.  
7. Relevant validation exists on the correct side of the system.  
8. Relevant tests exist or existing tests have been updated.  
9. The application builds with **no errors**.  
10. Relevant tests pass.  
11. No unrelated scope has been introduced.  
12. No secrets have been introduced.  
13. No obvious dead, duplicated, or spaghetti code has been introduced.

### **Phase compliance**

The agent must identify which PRD phase the requested task belongs to before implementing it.

The current roadmap is:

### **Phase 0 — Validation**

Before Phase 1 implementation:

* Conduct 10–15 target-user interviews.  
* Validate the problem, value proposition, retrieval expectations, reminder usefulness, and security-language expectations.

Do not treat research as a reason to invent product features. Research findings must go through the product decision process.

### **Phase 1a — Writing Core**

Includes:

* Authentication/account lifecycle.  
* Entry creation/editing.  
* Autosave.  
* Tags and normalization.  
* Calendar browsing.  
* Account deletion lifecycle.  
* Opt-in email reminders.  
* Required analytics instrumentation.

### **Phase 1b — Retrieval Core**

Includes:

* Image attachments.  
* PostgreSQL full-text search.  
* Cursor pagination.  
* Multi-tag AND filtering.  
* JSON export.  
* Image-aware export behavior.

### **Phase 2**

Potential future work includes:

* PDF export if it was not already included in the applicable release.  
* Search-ranking improvements.  
* Additional retention/re-engagement improvements.  
* AI features subject to a deliberate security/encryption decision.

Do not pull Phase 2 work into Phase 1 without explicit authorization.

---

## **Required completion report**

At the end of **every coding task**, provide a concise checklist.

Use this structure:

\#\# Completion Checklist

\- \[x\] Requested feature implemented  
\- \[x\] Applicable PRD requirements satisfied  
\- \[x\] Locked technologies preserved  
\- \[x\] Authorization/ownership rules verified  
\- \[x\] Business/data-protection rules verified  
\- \[x\] Tests added or updated  
\- \[x\] Tests passing  
\- \[x\] Production build passing with no errors  
\- \[x\] No unrelated scope added  
\- \[x\] No secrets introduced  
\- \[x\] Code reviewed for unnecessary duplication/spaghetti code

If an item is not complete, mark it `[ ]` and explain why.

Never report a task as complete while knowingly leaving a required item unresolved.

---

# **7\. What does the agent do when unsure?**

When uncertain, **do not invent scope**.

The agent must never:

* Add a new feature because it seems useful.  
* Choose a new payment provider.  
* Replace a locked database.  
* Replace authentication.  
* Introduce E2EE.  
* Add AI.  
* Create an undocumented business rule.  
* Invent pricing.  
* Invent entitlement behavior.  
* Invent a new deletion policy.  
* Invent a new privacy promise.  
* Create a second competing architecture.  
* Copy business logic into multiple places just to make a task easier.  
* Patch uncertainty with spaghetti code.

## **Decision procedure**

When unsure:

### **1\. Check this file**

Determine whether `AGENTS.md` already defines the rule.

If it does, follow it.

### **2\. Check the PRD**

Determine whether the PRD explicitly defines the behavior.

If it does, follow it.

### **3\. Check the existing codebase**

Look for established implementation patterns that comply with both documents.

Reuse them where appropriate.

### **4\. Prefer the smallest compliant implementation**

If the requirement is clear but the implementation detail is not, choose the simplest implementation that:

* Satisfies the PRD.  
* Preserves the architecture.  
* Preserves user-data safety.  
* Preserves the locked technology choices.  
* Does not create future coupling unnecessarily.

### **5\. Do not guess across ambiguity**

If two interpretations would create materially different:

* Business behavior.  
* Security behavior.  
* Data lifecycle behavior.  
* Payment behavior.  
* User-facing behavior.  
* Architecture.

do not silently choose one and encode it as fact.

State the ambiguity and identify the smallest decision required.

### **6\. Never solve uncertainty with duplication**

If the correct architecture is unclear, do not create:

* Multiple competing service layers.  
* Duplicate database models.  
* Duplicate business rules.  
* Temporary providers.  
* Generic "utils" containing unrelated behavior.  
* Giant conditional components.  
* Hard-coded exceptions.

Make the uncertainty explicit rather than turning it into structural debt.

### **7\. Never expand scope to make the implementation easier**

If a requirement is difficult, implement the requirement.

Do not change the product to fit the implementation.

Do not pull future features forward.

Do not "improve" the PRD while coding.

### **Final rule**

**When the agent is unsure, it must preserve scope, preserve locked choices, preserve user/data protections, and choose the smallest clean implementation supported by the PRD. It must never invent a new product decision merely to keep coding.**

