
### `skills/journal-search-retrieval/skill.md`

```markdown
---
name: journal-search-retrieval
description: Use for full-text search, journal retrieval, ranked search results, search pagination, tsvector, GIN indexes, ts_rank, search triggers, and journal listing queries.
---

# Journal Search and Retrieval

This skill teaches the ordered implementation flow for PostgreSQL-backed journal search and retrieval. The laws live in `database-schema.md`, `security.md`, and `coding-standard.md`, with search requirements defined by the PRD and `AGENTS.md`.

## Procedure

1. Read the search, retrieval, ownership, and pagination requirements in the PRD, `AGENTS.md`, `database-schema.md`, and `security.md`.
2. Identify whether the change affects search indexing, search queries, ranking, or journal listing.
3. Confirm that PostgreSQL full-text search remains the implementation.
4. Keep the searchable `tsvector` maintained by the database trigger rather than application code.
5. Confirm the GIN index exists for the search vector.
6. Build the search query from the authenticated user's scope.
7. Use PostgreSQL full-text search against the maintained `tsvector`.
8. Use `ts_rank` as the first-pass relevance score.
9. Apply cursor pagination to result retrieval.
10. Keep search indexing separate from the source journal content so indexing never changes the user's text.
11. For retrieval changes combined with tags, compose the search query with the required tag-filtering flow instead of creating a competing pagination system.
12. Test indexing, ownership, ranking, and cursor behavior before finishing.

## Code skeleton

```sql
-- Database-owned search index.
CREATE INDEX IF NOT EXISTS entry_search_vector_gin_idx
ON "Entry"
USING GIN ("searchVector");
-- Trigger-maintained search vector.
CREATE TRIGGER entry_search_vector_update
BEFORE INSERT OR UPDATE ON "Entry"
FOR EACH ROW
EXECUTE FUNCTION update_entry_search_vector();
const results = await prisma.$queryRaw<EntrySearchResult[]>`
  SELECT
    e.*,
    ts_rank(e."searchVector", websearch_to_tsquery('english', ${query})) AS rank
  FROM "Entry" e
  WHERE e."userId" = ${userId}
    AND e."searchVector" @@ websearch_to_tsquery('english', ${query})
    AND e."id" < ${cursor}
  ORDER BY rank DESC, e."id" DESC
  LIMIT ${limit};
`;