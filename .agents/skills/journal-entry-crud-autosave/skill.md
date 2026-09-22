
### `skills/journal-entry-crud-autosave/skill.md`

```markdown
---
name: journal-entry-crud-autosave
description: Use for creating, editing, viewing, deleting, autosaving, saving, loading, updating, or otherwise changing journal entries and journal-entry write paths.
---

# Journal Entry CRUD Autosave

This skill teaches the ordered implementation flow for journal entry work. The laws live in `journal-entry-integrity.md`, `coding-standard.md`, `security.md`, and `writing-activity.md`, with timing and product behavior defined by the PRD and `AGENTS.md`.

## Procedure

1. Read the entry requirements in the PRD, `AGENTS.md`, `journal-entry-integrity.md`, `security.md`, and `writing-activity.md`.
2. Identify whether the change is create, read, edit, delete, or autosave behavior.
3. Resolve the authenticated user on the server before reading or writing an entry.
4. Scope every entry query and mutation to that user.
5. Preserve the journal text exactly as entered; do not summarize, normalize, truncate, reorder, or silently rewrite it.
6. Build the smallest write path that validates the request and persists the exact entry content.
7. For autosave, make each save represent the current client content and prevent an older save from overwriting newer content.
8. Keep tags, search indexing, analytics, and other side effects separate from journal text mutation.
9. Emit writing-activity analytics only after a successful entry create or edit.
10. Instrument the client timing needed to measure New Entry → first character autosaved against the PRD's `<7s` goal.
11. Handle failed saves without discarding the user's newer local input.
12. Test the normal write path and the failure/conflict paths before finishing.

## Code skeleton

```ts
async function saveEntry(
  userId: string,
  input: SaveEntryInput,
) {
  const entry = await prisma.entry.findFirst({
    where: {
      id: input.entryId,
      userId,
    },
  });

  if (!entry) {
    throw new NotFoundError();
  }

  // Persist exact user content.
  const updated = await prisma.entry.update({
    where: { id: entry.id },
    data: {
      title: input.title,
      content: input.content,
    },
  });

  await recordWritingActivity({
    userId,
    action: "edit",
    timestamp: new Date(),
  });

  return updated;
}
// Client timing instrumentation
const start = performance.now();

// Load the editor, accept the first character, then measure
// until the first successful autosave acknowledgement.
const elapsedMs = performance.now() - start;

recordFirstAutosaveTiming({
  elapsedMs,
});