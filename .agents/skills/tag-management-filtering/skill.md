
### `skills/tag-management-filtering/skill.md`

```markdown
---
name: tag-management-filtering
description: Use for creating, assigning, removing, normalizing, editing, listing, searching, or filtering journal entries by tags, including multi-tag AND filtering and cursor pagination.
---

# Tag Management and Filtering

This skill teaches the ordered implementation flow for tag operations and multi-tag retrieval. The laws live in `database-schema.md`, `security.md`, and `coding-standard.md`, with product behavior defined by the PRD and `AGENTS.md`.

## Procedure

1. Read the tag, filtering, ownership, and pagination requirements in the PRD, `AGENTS.md`, `database-schema.md`, and `security.md`.
2. Identify whether the change creates a tag, changes a tag, assigns/removes a tag, or retrieves entries by tags.
3. Resolve the authenticated user before touching tags or tagged entries.
4. Normalize every tag by trimming whitespace and converting it to lowercase before uniqueness checks or persistence.
5. Enforce tag uniqueness within the authenticated user's scope.
6. Scope tag reads and mutations to that user.
7. For one or more selected tags, build the entry-ID subquery from tag matches owned by the user.
8. For multi-tag filtering, group matching tag rows by entry and require `COUNT(DISTINCT tagId)` to equal the number of selected tags.
9. Apply cursor pagination to the resulting entry set rather than replacing cursor pagination with offset pagination.
10. Keep normalization in one reusable path so every tag entry point behaves the same way.
11. Add focused tests for normalization, ownership, uniqueness, AND semantics, and cursor behavior.

## Code skeleton

```ts
const normalizedTag = input.name.trim().toLowerCase();

const tag = await prisma.tag.upsert({
  where: {
    userId_name: {
      userId,
      name: normalizedTag,
    },
  },
  create: {
    userId,
    name: normalizedTag,
  },
  update: {},
});
const selectedTagIds = input.tagIds;

const matchingEntryIds = prisma.entryTag.groupBy({
  by: ["entryId"],
  where: {
    tagId: { in: selectedTagIds },
    tag: {
      userId,
    },
  },
  having: {
    tagId: {
      _count: {
        equals: selectedTagIds.length,
      },
    },
  },
});

// Use the grouped entry IDs as the filter for the cursor-paginated
// entry query.