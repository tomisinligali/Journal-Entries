# Product Requirements Document (PRD)

## 1. Product Summary

### Product
A single-user journaling application for adults who want a simple, fast way to write, retrieve, and retain personal journal entries.

### Product Positioning
The product is **single-user and access-controlled by default**. It does not provide sharing features. It is **not end-to-end encrypted (E2EE) in v1**; entries are protected through application access controls and encryption at rest and in transit. This security posture must not be represented as cryptographic privacy from the service provider.

### Core Value Proposition
The product should make two activities exceptionally easy:

1. **Write:** start a new entry and begin saving it with minimal friction.
2. **Retrieve:** find a past entry quickly using calendar browsing, tags, and full-text search.

The product is designed around habit formation, with the primary behavioral persona being the **Habit Builder**, who journals approximately 3–5 times per week.

---

## 2. Problem Statement

Adults may want a journaling tool that is simpler and more focused than a general-purpose notes application while avoiding the social/sharing orientation of social journaling products.

This problem statement is a **product judgment, not a validated research finding**. Before Phase 1 build starts, validate the problem and the proposed value proposition through **10–15 interviews with target users**.

### Why this product
The product focuses on:
- Fast entry creation.
- Reliable autosaving.
- Easy retrieval of historical entries.
- Personal organization through tags and dates.
- User-controlled data export and deletion.
- No social-sharing workflow.

---

## 3. Goals and Non-Goals

### Goals

#### Goal 1 — Fast writing
A returning, already-authenticated user on a standard broadband connection can go from clicking **New Entry** to their first character autosaving in **under 7 seconds**, measured through client-side timing.

The target is composed of:
- Up to **2 seconds** for the editor to load.
- Up to **5 seconds** until the first autosave.

#### Goal 2 — Fast retrieval
A user can find any past entry through the application's retrieval mechanisms within **3 user actions**, using date/calendar browsing, tags, or full-text search.

#### Goal 3 — Habit formation
The product should support recurring journaling behavior, with the Habit Builder segment targeting approximately **3+ entries per active user per week**.

#### Goal 4 — Data control
Users can export their journal data and request account deletion, with a clearly defined recovery window and eventual hard deletion.

### Non-Goals for v1
- Social sharing.
- Public profiles.
- Collaborative editing.
- OCR/search over image contents.
- AI-generated summaries, sentiment analysis, recommendations, or other AI processing of entries.
- E2EE.
- Commercial-grade search relevance.
- PDF export as part of the first writing milestone.

---

## 4. User Personas

### Persona A — Habit Builder
An adult who wants journaling to become a recurring habit and typically writes **3–5 times per week**.

Primary needs:
- Very low friction to begin writing.
- Reliable autosave.
- Easy retrieval of previous writing.
- Organization through dates and tags.
- Optional reminders to support re-engagement.

The product's behavioral success should therefore be evaluated using both retention and actual writing frequency. A user who returns only twice in a month should not be treated as equivalent to a user who develops a recurring writing habit.

### Persona B — Reflective Archivist
A user who accumulates a large history of entries and values being able to browse, search, tag, export, and preserve that history.

### Persona C — Privacy-Conscious Writer
A user who expects their journal to be single-user and access-controlled and wants clear, honest communication about the application's security model.

The product must not imply that the service provider is technically unable to access stored content.

---

## 5. Functional Requirements

### Authentication and Account Lifecycle

1. Users can create an account using email/password authentication.
2. Users can authenticate using Google OAuth.
3. Users can reset a forgotten password.
4. Sessions are securely managed and protected against unauthorized access.
5. Users can sign out.
6. Users can request account deletion.

### Account Deletion and Recovery

7. Account deletion uses a **single 30-day deletion clock** beginning when the user requests account deletion.
8. During the 30-day recovery period, the account and its user-owned data remain recoverable according to the application's recovery behavior.
9. Account deletion immediately applies a deletion flag to all user-owned entries and overrides any independent entry-level soft-delete recovery window.
10. The account-level 30-day deadline is also the hard-delete deadline for the associated entries and other user-owned data.
11. Hard deletion is performed by the scheduled user-level deletion process; entries and other user-owned records must not maintain independent hard-delete clocks.
12. After the 30-day period, eligible account data is permanently deleted.

### Journal Entries

13. Users can create, edit, view, and delete journal entries.
14. Entries autosave automatically.
15. The first autosave must occur no later than 5 seconds after the relevant client-side autosave cycle begins, subject to network/service availability.
16. Deleted entries use soft deletion during the applicable account lifecycle, subject to the account-level deletion clock described above.

### Tags

17. Users can create and assign tags to entries.
18. Tag names are normalized at the application layer before uniqueness checks:
   - Trim leading/trailing whitespace.
   - Convert to lowercase.
19. A user cannot create two normalized tags with the same name.
20. Users can filter entries by one or more tags.
21. Multiple selected tags use **AND semantics**: an entry must contain every selected tag to match.

### Calendar Browsing

22. Users can browse entries by date/calendar.
23. Calendar browsing provides a retrieval path independent of full-text search.

### Image Attachments

24. Users can attach images to journal entries.
25. Supported image types are:
   - JPEG
   - PNG
   - WebP
26. Each image is limited to **10 MB**.
27. Image validation is performed **server-side before the storage write**. Client-side validation alone is insufficient.
28. Images are stored as attachments associated with the owning entry.
29. Images are not OCR'd and image contents are not searchable in v1.

### Full-Text Search

30. Users can search the text of their journal entries.
31. Search uses PostgreSQL full-text search with a `tsvector` column and GIN indexing.
32. The `tsvector` value is maintained by a **PostgreSQL trigger**, not application-level writes, so the index cannot silently drift when entries are modified through another write path.
33. Search results are ordered by PostgreSQL `ts_rank` score as a first pass.
34. Search ranking quality is a known v1 limitation and is not expected to match commercial search UX. Ranking should be revisited if user feedback indicates poor result ordering.
35. Image contents are excluded from full-text search in v1.

### Pagination and Tag Filtering

36. Entry lists use cursor-based pagination.
37. Tag AND-filtering with cursor pagination is implemented through a subquery that first selects `entryId`s matching all selected tags:
   - Group by entry ID.
   - Use `HAVING COUNT(DISTINCT tagId) = number of selected tags`.
   - Cursor-paginate over the resulting filtered entry ID set.
38. This query strategy must be implemented consistently rather than decided ad hoc by individual screens or endpoints.

### Data Export

39. Users can export their journal data as JSON.
40. JSON export includes all entries and associated metadata.
41. JSON export includes image metadata and either:
   - Embedded base64 image data, or
   - Signed, time-limited download URLs for each attached image.
42. If signed URLs are used, they remain valid for **at least 7 days after export**.
43. Users can export journal content as PDF.
44. PDF export embeds attached images inline in the document.

### Reminders

45. Opt-in email reminders are included in **Phase 1** because re-engagement is directly relevant to the Habit Builder's recurring-writing behavior and the product's retention objective.
46. Users can opt into or out of reminder emails.
47. Reminder delivery must not be mandatory for using the journaling product.

---

## 6. AI Processing Pipeline

AI processing is **deferred from v1**.

Deferring AI keeps optionality open on the future encryption decision either way: if E2EE is adopted later, AI processing on entry content would need to happen client-side or be reconsidered entirely.

No v1 feature should require sending journal content to an AI provider.

---

## 7. Technical Requirements

### Application Architecture

1. The application uses the approved web application architecture and PostgreSQL-backed persistence.
2. Authentication uses **NextAuth/Auth.js**.
3. Authorization must ensure users can only access their own entries, tags, images, exports, and account data.

### Search

4. Full-text search uses PostgreSQL `tsvector`.
5. The `tsvector` column is maintained by a **PostgreSQL trigger**, not application-level writes.
6. The search index uses a PostgreSQL **GIN** index.
7. Search ordering uses PostgreSQL `ts_rank` as the initial relevance score.

### Validation

8. Tag names must be normalized using trim + lowercase before uniqueness checks.
9. Image uploads must be validated server-side before storage:
   - Maximum size: 10 MB.
   - Allowed MIME types: JPEG, PNG, WebP.
10. Client-side validation may improve UX but cannot be treated as the security boundary.

### Pagination and Filtering

11. Cursor-based pagination is required for entry lists.
12. Multi-tag AND filtering must use the predefined grouped subquery strategy before cursor pagination.
13. The implementation must avoid offset pagination for the primary entry retrieval path.

### Analytics and Measurement

14. The application must emit an analytics event on every successful entry create/edit.
15. Each event must include:
   - `userId`
   - Timestamp
   - Event type/action
16. Events must be stored in a queryable store, such as a lightweight application events table or an approved third-party analytics system.
17. The instrumentation must be sufficient to calculate:
   - Weekly Active Writers (WAW).
   - 30-day retention.
   - Entries per active user per week.
18. Metrics must be computable without manual data pulls.

### Performance

19. The journal editor should load in no more than **2 seconds** under the standard broadband test condition used for Goal 1.
20. Client-side timing instrumentation must capture:
   - New Entry click.
   - Editor-ready time.
   - First character input.
   - First successful autosave.

### Deletion Processing

21. Hard deletion is handled at the User level.
22. The scheduled hard-delete job operates against accounts whose 30-day deletion deadline has passed.
23. The job must be idempotent.
24. The job must run daily.
25. Every execution must be logged.
26. Failure to run or failure to complete must generate an operational alert.
27. Monitoring must expose the count of accounts past their deletion deadline that are still awaiting hard deletion.

---

## 8. Business Model

### Freemium Direction

A hard entry-count cap is **not recommended** because it conflicts with the retention objective for the Habit Builder. At 3–5 entries per week, a 100-entry cap would be reached in roughly six months and could interrupt an established journaling habit.

If freemium is adopted, prefer gating around:
- Storage capacity.
- Export functionality, such as PDF export.
- Other non-core convenience features.

Do **not** use a hard entry-count wall as the default monetization mechanism for the core journaling experience.

---

## 9. Risks and Mitigations

### Risk 1 — Security posture misunderstood
**Risk:** Users may interpret "private" as E2EE or assume the provider cannot access content.

**Mitigation:** Product copy must describe the product as single-user and access-controlled. Explicitly state that v1 is not E2EE.

### Risk 2 — Search quality
**Risk:** PostgreSQL `ts_rank` may provide mediocre ordering for short, conversational journal entries with common repeated words.

**Mitigation:** Treat `ts_rank` as the v1 baseline rather than promising commercial-quality relevance. Monitor user feedback and revisit ranking only if evidence warrants it.

### Risk 3 — Account deletion race conditions
**Risk:** A failed or inconsistent deletion process could leave eligible user data stored beyond its promised deadline.

**Mitigation:** The hard-delete job must be idempotent, run daily, log every execution, and alert on-call if it fails to run or fails to complete for any eligible account. A monitoring dashboard must show the count of accounts past their 30-day deadline that are still awaiting hard deletion.

### Risk 4 — Search-index drift
**Risk:** Application-level maintenance of the search vector could fail when another write path changes an entry.

**Mitigation:** Maintain `tsvector` through a PostgreSQL trigger.

### Risk 5 — Inconsistent tag data
**Risk:** Variants such as `Work`, `work`, and ` work ` could become separate tags and make filtering appear broken.

**Mitigation:** Normalize tags by trimming and lowercasing before uniqueness checks.

### Risk 6 — Retention and re-engagement
**Risk:** Retention could underperform if users are not re-engaged.

**Mitigation:** Opt-in email reminders are included in Phase 1 rather than deferred to Phase 2.

### Risk 7 — Export data loss
**Risk:** Users could export entries but unintentionally lose attached images.

**Mitigation:** Define image handling explicitly for both JSON and PDF exports. JSON contains image metadata plus embedded data or signed URLs; PDF embeds images inline. Export URLs must remain valid for at least seven days.

### Risk 8 — Phase scope
**Risk:** Bundling all retrieval, writing, media, export, and search functionality into one milestone could delay the entire MVP.

**Mitigation:** Split Phase 1 into sequential milestones: Writing Core followed by Retrieval Core.

---

## 10. Prisma Data Model

The following model rules are required. Exact naming may follow the project's established Prisma conventions.

### User
Stores account identity and account-deletion lifecycle fields, including the timestamp at which deletion was requested and the effective hard-delete deadline.

### Entry
Stores:
- Owning user.
- Journal content.
- Creation timestamp.
- Update timestamp.
- Soft-delete state/timestamp.
- Search `tsvector` representation.

The database trigger maintains the search vector.

### Tag
Stores:
- Owning user.
- Normalized tag name.
- Creation timestamp.
- Update timestamp.

`Tag` uses a uniqueness constraint equivalent to:

`@@unique([userId, name])`

The application must normalize the name before this constraint is evaluated.

Tags must **not** be hard-cascade-deleted immediately when an account enters its 30-day deletion period. They remain recoverable with the rest of the user's data and are cleaned up by the scheduled hard-delete process.

### Image
Stores:
- Owning entry.
- Storage reference.
- MIME/type metadata.
- `sizeBytes`.
- Creation timestamp.
- Update timestamp.

`Image` must include:

`updatedAt DateTime @updatedAt`

### Tag timestamps
`Tag` must include:

`updatedAt DateTime @updatedAt`

### Deletion semantics

The system must not create separate, conflicting deletion clocks for individual entries.

The authoritative deletion lifecycle is the **User-level 30-day clock**. When that clock expires, the scheduled hard-delete process removes the user's owned records consistently.

Where relational cascade behavior is used, it must not cause user-owned data that is supposed to remain recoverable during the 30-day period to disappear immediately.

---

## 11. Success Metrics

### Primary Reporting Metrics

#### 1. Weekly Active Writers (WAW)
A user is considered active when they successfully create or edit at least one journal entry during a seven-day period.

WAW is a useful reporting metric but is binary: one entry can make a user active.

#### 2. 30-Day Retention
Measure whether a user returns and performs a qualifying journal-writing action during the defined day 23–30 retention window.

This remains a primary reporting metric, but it is also binary and can overstate product value if interpreted without behavioral frequency.

### Secondary Leading Metric

#### 3. Entries per Active User per Week
Track the **median number of entries per active user per week**.

Target for the Habit Builder segment:

**3+ entries per week.**

This is the leading behavioral signal for whether the product is actually delivering on its core habit-formation goal.

### Interpretation

WAW and 30-day retention are lagging/binary metrics. Entries-per-week is the leading behavioral metric.

Leadership and product reviews should not treat a healthy retention number as sufficient evidence of success if writing frequency remains materially below the Habit Builder target.

---

## 12. Assumptions

1. The product is single-user and access-controlled rather than E2EE in v1.
2. Authentication uses NextAuth/Auth.js.
3. PostgreSQL is the persistence layer.
4. Full-text search uses PostgreSQL `tsvector`, GIN indexing, and `ts_rank`.
5. Image contents are not OCR'd or searchable in v1.
6. Image uploads are limited to JPEG, PNG, and WebP and must not exceed 10 MB.
7. Exported image URLs, if used instead of embedded image data, remain valid for at least 7 days after export.
8. AI processing is deferred from v1.
9. Account deletion and all user-owned data use one authoritative 30-day deletion clock.
10. Opt-in email reminders are available in Phase 1.
11. Freemium, if adopted, should avoid a hard entry-count cap and prefer gating storage/export functionality.
12. The product problem statement has not yet been validated through formal user research; 10–15 target-user interviews are required before Phase 1 build begins.

---

## 13. Phased Roadmap

### Phase 0 — Validation

Before Phase 1 implementation:

1. Conduct 10–15 interviews with target users.
2. Validate:
   - The problem statement.
   - The need for a focused journaling product.
   - Retrieval expectations.
   - Reminder usefulness.
   - Expectations around security/privacy language.
3. Incorporate material findings into the product backlog before implementation.

### Phase 1a — Writing Core

Build and validate:

1. Authentication and account lifecycle.
2. Entry creation and editing.
3. Autosave.
4. Tags and tag normalization.
5. Calendar browsing.
6. Account deletion lifecycle.
7. Opt-in email reminders.
8. Analytics instrumentation required for success metrics.

**Milestone objective:** Users can reliably create, save, organize, and return to journal entries.

### Phase 1b — Retrieval Core

Build and validate:

1. Image attachments.
2. PostgreSQL full-text search.
3. Cursor-based pagination.
4. Multi-tag AND filtering with the specified query strategy.
5. JSON export.
6. Image-aware export behavior.

**Milestone objective:** Users can efficiently retrieve and take control of their accumulated journal history.

### Phase 2 — Extended Value

Potential follow-on capabilities include:

1. PDF export if not included in the initial release.
2. Improvements to search ranking based on observed user behavior.
3. Additional re-engagement and retention improvements.
4. AI features, subject to a deliberate review of the encryption/security model.

No Phase 2 feature should be treated as a v1 requirement unless explicitly promoted.

---

## 14. Open Questions

### Open Question 1 — AI
What AI capabilities, if any, provide sufficient user value to justify processing journal content?

**v1 default:** No AI processing.

### Open Question 2 — Future E2EE
Should the product adopt end-to-end encryption in a future release?

**v1 default:** No E2EE.

Any future E2EE decision must account for:
- Server-side versus client-side processing.
- Search architecture.
- Export behavior.
- Password/account recovery.
- AI processing.

### Open Question 3 — Password reset and E2EE interaction
How should password reset work if a future E2EE design makes encryption keys dependent on user-controlled credentials?

**Default:** None independently.

This question has no independent default; it is fully gated on the outcome of Open Question 2 and must be resolved as a pair, not separately.

### Open Question 4 — Search ranking
Should search ranking move beyond PostgreSQL `ts_rank`?

**v1 default:** No. Revisit only if observed user feedback demonstrates inadequate result ordering.

### Open Question 5 — Freemium boundary
Where should paid functionality begin if monetization is introduced?

**v1 product direction:** Do not gate the core journaling habit behind a hard entry count. Prefer storage/export/convenience gates.

### Open Question 6 — Reminder optimization
What reminder frequency and timing produce useful re-engagement without becoming intrusive?

**v1 default:** Opt-in email reminders; optimize cadence after observing actual usage.

---

## 15. Definition of Done

The PRD is considered implemented for v1 when:

- Authentication and account lifecycle work end-to-end.
- Entry CRUD and autosave work reliably.
- The 7-second New Entry → first autosave goal is instrumented and testable.
- Tags are normalized and unique per user.
- Calendar browsing works.
- Image uploads enforce the 10 MB and MIME-type limits server-side.
- Search uses trigger-maintained `tsvector` + GIN and `ts_rank`.
- Multi-tag AND filtering uses the specified subquery strategy with cursor pagination.
- JSON/PDF export behavior preserves attached images according to the export rules.
- Account deletion uses one authoritative 30-day clock.
- The hard-delete job is daily, idempotent, logged, monitored, and alerting.
- Analytics events support WAW, 30-day retention, and entries-per-week measurement.
- Opt-in email reminders are available.
- No product copy incorrectly claims E2EE or provider-inaccessible content.
- Phase 1a and Phase 1b are independently shippable milestones.
