---
trigger: always_on
---

# Writing Activity Rules

## Purpose

Ensure habit and retention metrics represent real journal-writing behavior.

## Rules

1. A qualifying writing activity is a successful journal entry creation or edit.

2. Merely opening an entry does not count as writing activity.

3. Searching, calendar browsing, tagging, exporting, uploading images, or changing preferences does not count as writing activity.

4. Failed entry writes must not count as successful writing activity.

5. Every successful entry create/edit must emit the required analytics event with:
   - `userId`
   - Timestamp
   - Event type/action

6. Analytics must be stored in a queryable system capable of calculating:
   - Weekly Active Writers.
   - 30-day retention.
   - Entries per active user per week.

7. Metrics must be computable without manual data pulls.

8. Do not artificially generate activity events to improve product metrics.

9. WAW and retention must use the same qualifying writing-action definition consistently.

10. Entries-per-active-user-per-week remains the leading behavioral measure for the Habit Builder target of 3+ entries per week.

## Failure Condition

If analytics can falsely classify non-writing behavior as writing activity, the implementation failed.