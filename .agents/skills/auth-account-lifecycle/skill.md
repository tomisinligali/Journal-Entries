---
name: auth-account-lifecycle
description: Use for signup, email/password authentication, Google OAuth, password reset, sessions, sign-out, account deletion initiation, authentication, authorization, and account lifecycle work.
---

# Auth Account Lifecycle

This skill teaches the ordered implementation flow for authentication and account lifecycle work. The laws live in `security.md`, `coding-standard.md`, and `database-schema.md`, with product scope defined by the PRD and `AGENTS.md`.

## Procedure

1. Read the relevant authentication and account requirements in the PRD, `AGENTS.md`, and `security.md` before changing code.
2. Identify the lifecycle operation being changed: signup, email/password login, Google OAuth, password reset, session handling, sign-out, or account deletion initiation.
3. Trace every request to the authenticated user before accessing or changing user-owned data.
4. Keep authentication and authorization decisions on the server.
5. Use the established NextAuth/Auth.js integration instead of introducing another authentication mechanism.
6. For OAuth changes, preserve the existing account-linking and session model rather than creating a parallel identity path.
7. For password reset, follow the existing secure reset flow and keep reset behavior inside the established authentication boundary.
8. For session changes, verify that protected server operations receive the authenticated identity they expect.
9. For account deletion initiation, start the authoritative user-level deletion lifecycle defined by `account-deletion-recovery`; do not create a separate entry-level deletion clock.
10. Validate the changed lifecycle with focused tests before considering the work complete.

## Code skeleton

```ts
// Server-side protected operation
const session = await auth();

if (!session?.user?.id) {
  throw new UnauthorizedError();
}

const userId = session.user.id;

// Scope every user-owned query by the authenticated user.
const entry = await prisma.entry.findFirst({
  where: {
    id: entryId,
    userId,
  },
});
// Authentication boundary
export async function protectedAction(input: Input) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }

  return performAuthorizedOperation(session.user.id, input);
}