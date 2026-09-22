
### `skills/account-deletion-recovery/skill.md`

```markdown
---
name: account-deletion-recovery
description: Use for account deletion, deletion requests, deletion recovery, soft deletion, hard deletion, 30-day deletion clocks, deletion jobs, cleanup, overdue deletion monitoring, and deletion failures.
---

# Account Deletion and Recovery

This skill teaches the ordered implementation flow for the account deletion lifecycle. The laws live in `database-schema.md`, `security.md`, `coding-standard.md`, and `git-conventions.md`, with lifecycle requirements defined by the PRD and `AGENTS.md`.

## Procedure

1. Read the deletion requirements in the PRD, `AGENTS.md`, `database-schema.md`, and `security.md`.
2. Treat the user-level deletion clock as the single authoritative lifecycle.
3. When deletion is requested, mark the user for deletion using that lifecycle rather than creating separate timers for individual entries.
4. Immediately flag the user's owned entries as required by the account-deletion lifecycle.
5. Preserve the distinction between recoverable state and irreversible hard deletion.
6. During the recovery window, restore the user according to the approved lifecycle instead of deleting and recreating records.
7. Do not allow independent entry recovery to override an account-level deletion request.
8. Implement hard deletion at the User level so all user-owned data follows the authoritative account lifecycle.
9. Make the deletion job idempotent so retrying it does not create inconsistent results.
10. Run the job daily as required by the PRD.
11. Log enough operational information to identify failures without logging sensitive user content.
12. Monitor overdue accounts awaiting deletion and alert when deletion processing fails or does not complete.
13. Test request, recovery, expiry, retry, and failure paths before finishing.

## Code skeleton

```ts
// Start the single account-level deletion clock.
await prisma.user.update({
  where: { id: userId },
  data: {
    deletionRequestedAt: new Date(),
  },
});

// Account deletion takes precedence over independent entry recovery.
await prisma.entry.updateMany({
  where: { userId },
  data: {
    // Use the project's existing deletion flag/state.
    deletedAt: new Date(),
  },
});
// Daily idempotent hard-deletion job.
const users = await findUsersPastDeletionDeadline();

for (const user of users) {
  try {
    await hardDeleteUser(user.id);
    await recordDeletionSuccess(user.id);
  } catch (error) {
    await recordDeletionFailure(user.id, error);
    await alertDeletionFailure(user.id);
  }
}
async function hardDeleteUser(userId: string) {
  // Delete through the authoritative User lifecycle.
  // Database relations must remove all user-owned records
  // according to the established schema.
  await prisma.user.delete({
    where: { id: userId },
  });
}