---
trigger: always_on
---

# Journal Entry Integrity Rules

## Purpose

Protect the user's journal as authoritative, user-authored content.

## Rules

1. Never silently rewrite, summarize, truncate, reorder, or alter journal text.

2. Autosave must preserve exactly what the user entered.

3. Adding tags, searching, indexing, exporting, attaching images, or generating analytics must never mutate journal text.

4. Search indexing must not modify the source entry.

5. Export must preserve the journal's actual content rather than generating a rewritten version.

6. AI must never modify an entry automatically.

7. Any AI-generated content must be presented as a separate suggestion requiring explicit user action before becoming journal content.

8. Failed saves must not silently overwrite newer user content.

9. Never discard user input merely because a background operation fails.

## Failure Condition

If user-authored journal content can be silently changed, lost, overwritten, or replaced, the task failed.