---
trigger: always_on
---

# Database Schema Rules

## Purpose

Protect journal data integrity, ownership boundaries, query correctness, and deletion behavior.

## Rules

1. PostgreSQL is the database and Prisma is the ORM. Do not replace or introduce another primary persistence layer.

2. Every user-owned record must have an unambiguous ownership path that can be enforced server-side.

3. Queries for user-owned data must always be scoped to the authenticated user.

4. Tag names must be trimmed and lowercased before uniqueness checks.

5. User tags must be unique by normalized name per user.

6. Entry lists must use cursor pagination. Do not introduce offset pagination as the primary retrieval path.

7. Multi-tag filtering must use the approved grouped subquery strategy:
   - Select matching entry IDs.
   - Group by entry ID.
   - Require `HAVING COUNT(DISTINCT tagId) = selectedTagCount`.
   - Cursor-paginate the resulting entry set.

8. Journal full-text search must use PostgreSQL `tsvector`, GIN indexing, and `ts_rank`.

9. The `tsvector` must be maintained by a PostgreSQL trigger, not application-level writes.

10. Schema changes must use version-controlled Prisma migrations. Never manually modify production schema.

11. `Tag` and `Image` must retain required update timestamps.

12. Account deletion uses one authoritative 30-day user-level deletion clock. Do not create conflicting independent deletion clocks.

13. Data that must remain recoverable during the deletion window must not be immediately cascade-deleted.

14. The hard-delete process must be idempotent and safe to run repeatedly.

15. Add indexes where required to support the application's primary retrieval, filtering, ownership, and deletion queries.

## Failure Condition

Breaking an ownership, deletion, search-index, tag-integrity, or migration rule means the task failed, even if the application builds.