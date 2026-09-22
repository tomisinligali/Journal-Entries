---
trigger: always_on
---

# Coding Standard Rules

## Purpose

Keep the codebase maintainable, predictable, testable, and aligned with the PRD and AGENTS.md.

## Rules

1. TypeScript must use strict typing. Do not use `any` to bypass type errors.

2. Keep business logic out of UI components. Domain logic belongs in the appropriate feature/server layer.

3. Do not duplicate business rules across routes, components, or services. Create one authoritative implementation.

4. Prefer small, focused functions and components with clear responsibilities.

5. Validate all important inputs at the server boundary. Client-side validation is supplementary, never authoritative.

6. Do not introduce a new library, architectural pattern, abstraction, or service when the existing stack already solves the problem.

7. Do not silently change established behavior to make an implementation easier.

8. Critical journal, authentication, deletion, search, export, reminder, analytics, and payment behavior must have automated tests.

9. Do not leave dead code, temporary debugging code, commented-out implementations, or TODOs for required behavior.

10. A task is not complete if the project does not build cleanly and the relevant tests do not pass.

## Failure Condition

Breaking a rule in this file means the implementation is incomplete, even if the application appears to work.