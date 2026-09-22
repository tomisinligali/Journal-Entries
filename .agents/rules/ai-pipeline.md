---
trigger: always_on
---

# AI Pipeline Rules

## Purpose

Define a provider-independent AI boundary that supports Claude and DeepSeek without coupling product logic to either provider.

## V1 Rule

AI processing is deferred from v1.

No v1 feature may require sending journal content to Claude, DeepSeek, or any other AI provider.

AI may only be introduced when the feature is explicitly promoted into scope.

## Provider Independence

1. Product/domain logic must never depend directly on Claude- or DeepSeek-specific APIs.

2. Use an internal provider-neutral AI interface/adapter.

3. Claude and DeepSeek must be interchangeable implementations behind that interface.

4. Provider-specific request formats, authentication, model names, token parameters, and response parsing must remain inside the provider adapter.

5. Application code must depend on the normalized internal AI request/response contract, not on a provider SDK response type.

6. Switching between Claude and DeepSeek must not require changes to journal, authentication, database, or UI domain logic.

7. Never assume that a capability exists identically across providers. Structured output, tool calling, token limits, context limits, and response formats must be verified by the provider adapter.

## Security

8. All AI provider calls must originate server-side.

9. AI API keys must never appear in client bundles or browser requests.

10. Do not send journal content to an AI provider unless the feature explicitly requires it and the product/security decision permits it.

11. Minimize transmitted data. Send only the fields required for the approved AI operation.

12. Never log full journal content merely for AI debugging.

13. AI must never silently become a secondary storage location for journal content.

## Reliability

14. AI failures must not corrupt or block the core journaling experience unless the explicitly approved feature requires AI as a hard dependency.

15. Provider timeouts, rate limits, malformed responses, and provider errors must be handled explicitly.

16. Where the feature permits it, provide a deterministic non-AI fallback.

17. Do not automatically retry requests in a way that can unexpectedly multiply provider costs.

18. AI operations must have bounded input, output, timeout, and usage limits.

## Output Safety

19. Treat AI output as untrusted external data.

20. Validate and parse AI responses before using them.

21. Never write AI output directly into journal content without explicit user action.

22. AI-generated content must be clearly distinguishable from user-authored content.

## Observability

23. AI requests must be traceable without logging sensitive journal content.

24. Track provider, operation, success/failure, latency, and usage/cost metadata where AI is explicitly approved.

25. Provider-specific failures must be distinguishable from application failures.

## Model Selection

26. Do not hard-code a specific Claude or DeepSeek model into domain logic.

27. Model selection must be configuration-driven and server-side.

28. Changing the configured provider or model must not require a database migration unless the product explicitly introduces provider-specific persisted behavior.

## Future E2EE Compatibility

29. Do not design the AI layer in a way that assumes server-side access to journal content will always be permitted.

30. Any future E2EE decision must explicitly reconsider how AI processing works.

## Failure Condition

The AI implementation fails if it:
- couples domain logic to Claude or DeepSeek,
- exposes provider credentials,
- silently sends journal content to an AI provider,
- corrupts user content,
- bypasses explicit product scope,
- or makes switching providers require rewriting unrelated application logic.