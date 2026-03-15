# Requirements Document

## Introduction

Phase 5 of AutoContent Pro v1.0 — Risk Control and Launch Readiness.

This phase hardens the system for production by upgrading rate limiting to a user + IP dual-dimension strategy with differentiated tiers for anonymous, free-plan, and paid-plan users; implementing audit logging for sign-in, payment, subscription, and critical failure events; enhancing content moderation behavior and its error handling; adding API integration tests for the generate, history, usage, and payment webhook routes; adding E2E tests for the core user paths (sign-in, generate, view history, initiate payment); and producing a final v1.0 launch acceptance checklist.

This phase depends on all previous phases being complete:
- Phase 1: `autocontent-pro-mvp` — core generation pipeline, IP-based anonymous rate limiting, basic keyword moderation
- Phase 2: `supabase-infrastructure` — database schema, RLS, `audit_logs` table
- Phase 3: `cloud-data-plan-foundation` — generation writer, usage stats, history and usage APIs
- Phase 4: `payments-monetization` — Lemon Squeezy checkout, webhook handler, plan capability enforcement

Existing MVP safeguards (IP-based rate limiting in `TSK-M1-033`, keyword moderation in `TSK-M1-032`) are enhanced in place — not redesigned from scratch.

Scope is strictly limited to TASKS.md items: TSK-M2-030, TSK-M2-032, TSK-M2-040, TSK-M2-041, TSK-M2-042.

---

## Scope Overlap Check

The following items were explicitly verified as belonging to earlier phases and are excluded here:

- Database schema for `audit_logs` → Phase 2 (`supabase-infrastructure`)
- RLS policies on `audit_logs` and `webhook_events` → Phase 2
- Basic keyword moderation filter and `CONTENT_BLOCKED` error code → Phase 1 (`autocontent-pro-mvp`, TSK-M1-032)
- IP-only anonymous rate limiting → Phase 1 (TSK-M1-033)
- Plan capability enforcement (platform count, monthly generation limit) → Phase 4 (`payments-monetization`, TSK-M2-031)
- Webhook idempotency and signature verification → Phase 4 (TSK-M2-023)
- `getPlanCapability` service → Phase 3 (`cloud-data-plan-foundation`)
- Supabase Auth integration and session management → Phase 3 (`user-authentication`)

---

## Glossary

- **Rate_Limiter**: The server-side module in `src/lib/rate-limit/` that enforces request frequency limits using Upstash Redis.
- **Anonymous_User**: A request with no valid Supabase session — identified by IP address only.
- **Free_User**: An authenticated user whose active plan code is `free` (30 generations/month, 3 platforms).
- **Paid_User**: An authenticated user whose active plan code is `creator`, `studio`, or `enterprise`.
- **Rate_Limit_Window**: The rolling time window over which request counts are measured (e.g., 1 minute, 1 hour, 1 day).
- **Rate_Limit_Key**: The Redis key used to track request counts — composed from dimension identifiers (IP, user ID) and the window.
- **Audit_Logger**: The server-side module in `src/lib/db/` responsible for writing rows to the `audit_logs` table using the service role client.
- **Audit_Action**: A string constant in `UPPER_SNAKE_CASE` identifying the type of event recorded in `audit_logs` (e.g., `USER_SIGN_IN`, `PAYMENT_WEBHOOK_RECEIVED`).
- **Moderation_Service**: The existing module in `src/lib/moderation/` that filters content against a keyword blocklist before generation.
- **Generate_Route**: The existing `POST /api/generate` route.
- **Webhook_Handler**: The existing `POST /api/webhooks/lemon` route.
- **Integration_Test**: An automated test that exercises a real API route against a real (local) Supabase instance and real Redis, without mocking the database or cache layer.
- **E2E_Test**: An automated browser-level test using Playwright that exercises a complete user path against the running application.
- **Launch_Checklist**: A structured list of verifiable acceptance criteria that must all pass before the v1.0 production deployment is approved.
- **Upstash_Redis**: The managed Redis service used for rate limit counters, accessed via `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- **Service_Role_Client**: The Supabase client initialized with `SUPABASE_SERVICE_ROLE_KEY` that bypasses RLS, used for server-side writes to `audit_logs`.

---

## Requirements

### Requirement 1: Dual-Dimension Rate Limiting Infrastructure

**User Story:** As a backend engineer, I want a reusable rate limiting module backed by Upstash Redis, so that all API routes can enforce per-user and per-IP limits without duplicating logic.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL be implemented in `src/lib/rate-limit/index.ts` and export a `checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>` function.
2. THE Rate_Limiter SHALL use Upstash Redis (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) as the backing store for all counters.
3. WHEN `checkRateLimit` is called, THE Rate_Limiter SHALL increment the counter for the given key and return `{ allowed: boolean, remaining: number, resetAt: number }`.
4. WHEN the counter for a key reaches the configured limit within the window, THE Rate_Limiter SHALL return `{ allowed: false, remaining: 0, resetAt: <unix timestamp> }`.
5. WHEN the window expires, THE Rate_Limiter SHALL reset the counter for that key automatically via Redis TTL.
6. IF the Upstash Redis connection fails, THEN THE Rate_Limiter SHALL return `{ allowed: true, remaining: -1, resetAt: -1 }` and log a warning — rate limit failures SHALL NOT block requests.
7. THE Rate_Limiter SHALL construct Rate_Limit_Keys using the pattern `rl:{scope}:{identifier}:{windowLabel}` to avoid key collisions between different routes and dimensions.

---

### Requirement 2: Differentiated Rate Limiting on POST /api/generate

**User Story:** As a backend engineer, I want the generate route to apply different rate limits based on user identity and plan tier, so that anonymous users face stricter limits while paid users get more headroom.

#### Acceptance Criteria

1. WHEN an Anonymous_User calls `POST /api/generate`, THE Generate_Route SHALL apply a rate limit of 5 requests per hour per IP address using the Rate_Limiter.
2. WHEN a Free_User calls `POST /api/generate`, THE Generate_Route SHALL apply a rate limit of 20 requests per hour per user ID, with an additional 10 requests per hour per IP as a secondary guard.
3. WHEN a Paid_User calls `POST /api/generate`, THE Generate_Route SHALL apply a rate limit of 100 requests per hour per user ID, with an additional 30 requests per hour per IP as a secondary guard.
4. WHEN any rate limit check returns `{ allowed: false }`, THE Generate_Route SHALL return HTTP 429 with error code `RATE_LIMITED` before invoking the AI provider or moderation service.
5. THE Generate_Route SHALL evaluate rate limits after Zod validation but before content moderation and AI generation.
6. WHEN a rate limit is exceeded, THE Generate_Route SHALL include a `retryAfter` field in the error response `details` containing the Unix timestamp from `resetAt`.
7. THE Generate_Route SHALL apply rate limits using the Rate_Limiter — the existing MVP IP-only check (TSK-M1-033) SHALL be replaced by this dual-dimension strategy.

---

### Requirement 3: Rate Limiting on POST /api/extract

**User Story:** As a backend engineer, I want the extract route to also enforce rate limits, so that URL extraction — which involves external network calls — cannot be abused.

#### Acceptance Criteria

1. WHEN an Anonymous_User calls `POST /api/extract`, THE System SHALL apply a rate limit of 3 requests per hour per IP address.
2. WHEN a Free_User calls `POST /api/extract`, THE System SHALL apply a rate limit of 10 requests per hour per user ID.
3. WHEN a Paid_User calls `POST /api/extract`, THE System SHALL apply a rate limit of 30 requests per hour per user ID.
4. WHEN the rate limit is exceeded, THE System SHALL return HTTP 429 with error code `RATE_LIMITED`.

---

### Requirement 4: Audit Logging — Sign-In Events

**User Story:** As a backend engineer, I want sign-in events to be recorded in `audit_logs`, so that authentication activity is traceable for security investigations.

#### Acceptance Criteria

1. WHEN a user successfully signs in via Supabase Auth, THE Audit_Logger SHALL insert a row into `audit_logs` with `action = 'USER_SIGN_IN'`, `user_id`, `ip_address`, `user_agent`, and `created_at`.
2. WHEN a sign-in attempt fails due to invalid credentials, THE Audit_Logger SHALL insert a row into `audit_logs` with `action = 'USER_SIGN_IN_FAILED'`, `ip_address`, `user_agent`, `user_id = NULL`, and a `metadata` field containing `{ reason: string }`.
3. THE Audit_Logger SHALL use the Service_Role_Client to write to `audit_logs`, bypassing RLS.
4. IF the `audit_logs` write fails, THEN THE Audit_Logger SHALL log a structured error but SHALL NOT block or fail the sign-in response.
5. THE Audit_Logger SHALL be implemented in `src/lib/db/audit-logger.ts` and export a `writeAuditLog(entry: AuditLogEntry): Promise<void>` function.

---

### Requirement 5: Audit Logging — Payment and Subscription Events

**User Story:** As a backend engineer, I want payment and subscription lifecycle events to be recorded in `audit_logs`, so that billing activity is auditable and disputes can be investigated.

#### Acceptance Criteria

1. WHEN the Webhook_Handler successfully processes a `subscription_created` event, THE Audit_Logger SHALL insert a row with `action = 'SUBSCRIPTION_CREATED'`, `user_id`, `resource_type = 'subscription'`, `resource_id = provider_subscription_id`, and `metadata` containing the plan code and provider.
2. WHEN the Webhook_Handler successfully processes a `subscription_cancelled` event, THE Audit_Logger SHALL insert a row with `action = 'SUBSCRIPTION_CANCELLED'`, `user_id`, `resource_type = 'subscription'`, `resource_id = provider_subscription_id`.
3. WHEN the Webhook_Handler successfully processes a `subscription_updated` event that changes the subscription status, THE Audit_Logger SHALL insert a row with `action = 'SUBSCRIPTION_UPDATED'`, `user_id`, and `metadata` containing `{ previousStatus, newStatus }`.
4. WHEN the Webhook_Handler successfully processes an `order_created` event, THE Audit_Logger SHALL insert a row with `action = 'ORDER_CREATED'`, `user_id`, `resource_type = 'order'`, `resource_id = provider_order_id`.
5. IF the audit log write fails during webhook processing, THEN THE Webhook_Handler SHALL log the failure but SHALL NOT return an error response — the webhook SHALL still return HTTP 200.
6. THE Audit_Logger SHALL write all payment audit entries using the Service_Role_Client.

---

### Requirement 6: Audit Logging — Critical Failure Events

**User Story:** As a backend engineer, I want critical system failures to be recorded in `audit_logs`, so that production incidents can be investigated with full context.

#### Acceptance Criteria

1. WHEN the Generate_Route returns HTTP 500 (`AI_PROVIDER_ERROR`), THE Audit_Logger SHALL insert a row with `action = 'GENERATION_FAILED'`, `user_id` (or NULL for anonymous), `metadata` containing `{ requestId, errorCode, platformCount, durationMs }`.
2. WHEN the Webhook_Handler returns HTTP 401 (`WEBHOOK_SIGNATURE_INVALID`), THE Audit_Logger SHALL insert a row with `action = 'WEBHOOK_SIGNATURE_INVALID'`, `user_id = NULL`, `ip_address`, and `metadata` containing `{ provider: 'lemonsqueezy' }`.
3. WHEN the Checkout_API returns HTTP 503 (`SERVICE_UNAVAILABLE`) due to a Lemon Squeezy SDK failure, THE Audit_Logger SHALL insert a row with `action = 'CHECKOUT_FAILED'`, `user_id`, and `metadata` containing `{ planCode, requestId }`.
4. IF the audit log write fails for a critical failure event, THEN THE Audit_Logger SHALL log a structured warning but SHALL NOT alter the original error response.
5. THE Audit_Logger SHALL be called after the error response is constructed but before it is returned, so that audit failures cannot affect the HTTP response.

---

### Requirement 7: Enhanced Content Moderation Behavior

**User Story:** As a backend engineer, I want the content moderation service to provide structured, actionable error details, so that clients can display meaningful feedback and the team can monitor moderation patterns.

#### Acceptance Criteria

1. THE Moderation_Service SHALL be implemented in `src/lib/moderation/index.ts` and export a `checkContent(content: string): ModerationResult` function where `ModerationResult = { blocked: boolean; reason?: string; matchedKeywords?: string[] }`.
2. WHEN content is blocked, THE Moderation_Service SHALL return `{ blocked: true, reason: 'KEYWORD_MATCH', matchedKeywords: string[] }` — the matched keywords SHALL be included for logging but SHALL NOT be returned to the client.
3. WHEN the Generate_Route receives `{ blocked: true }` from the Moderation_Service, THE Generate_Route SHALL return HTTP 422 with error code `CONTENT_BLOCKED` and a user-facing message that does not reveal the matched keywords.
4. THE Generate_Route SHALL call the Moderation_Service after rate limit checks and before invoking the AI provider.
5. WHEN content is blocked, THE Audit_Logger SHALL insert a row with `action = 'CONTENT_BLOCKED'`, `user_id` (or NULL), and `metadata` containing `{ requestId, reason, keywordCount: number }` — matched keywords SHALL NOT be stored in `audit_logs`.
6. THE Moderation_Service SHALL maintain its keyword list as a configurable constant in `src/lib/moderation/keywords.ts`, not hardcoded inline.
7. WHEN content passes moderation, THE Moderation_Service SHALL return `{ blocked: false }` without additional fields.

---

### Requirement 8: API Integration Tests — POST /api/generate

**User Story:** As a QA engineer, I want automated integration tests for the generate route, so that rate limiting, moderation, and plan enforcement are verified against a real environment.

#### Acceptance Criteria

1. THE integration test suite for `/api/generate` SHALL be located at `tests/integration/risk-control-launch-readiness/generate.test.ts`.
2. THE test suite SHALL verify that a valid request from an authenticated free-plan user returns HTTP 200 with a `generationId` and `results`.
3. THE test suite SHALL verify that a request exceeding the anonymous IP rate limit returns HTTP 429 with error code `RATE_LIMITED`.
4. THE test suite SHALL verify that a request with blocked content returns HTTP 422 with error code `CONTENT_BLOCKED`.
5. THE test suite SHALL verify that an authenticated free-plan user requesting more platforms than their plan allows returns HTTP 402 with error code `PLAN_LIMIT_REACHED`.
6. THE test suite SHALL verify that a request with an invalid platform code returns HTTP 400 with error code `INVALID_PLATFORM`.
7. THE test suite SHALL use a shared `helpers.ts` to create and clean up test users and reset Redis rate limit keys between tests.

---

### Requirement 9: API Integration Tests — GET /api/history and GET /api/usage

**User Story:** As a QA engineer, I want automated integration tests for the history and usage routes, so that data isolation and response shape are verified.

#### Acceptance Criteria

1. THE integration test suite SHALL include tests for `GET /api/history` at `tests/integration/risk-control-launch-readiness/history.test.ts`.
2. THE test suite SHALL verify that an unauthenticated request to `GET /api/history` returns HTTP 401 with error code `UNAUTHORIZED`.
3. THE test suite SHALL verify that an authenticated user only receives their own generation records — records belonging to a second test user SHALL NOT appear in the response.
4. THE test suite SHALL verify that the response items do not contain `input_content` or `result_json` fields.
5. THE test suite SHALL verify that `GET /api/usage` returns the correct `monthlyGenerationCount` after a generation is written.
6. THE test suite SHALL verify that `GET /api/usage` returns HTTP 401 for unauthenticated requests.

---

### Requirement 10: API Integration Tests — POST /api/webhooks/lemon

**User Story:** As a QA engineer, I want automated integration tests for the webhook handler, so that signature verification, idempotency, and subscription state transitions are verified end-to-end.

#### Acceptance Criteria

1. THE integration test suite for the webhook handler SHALL be located at `tests/integration/risk-control-launch-readiness/webhook.test.ts`.
2. THE test suite SHALL verify that a request with an invalid signature returns HTTP 401 with error code `WEBHOOK_SIGNATURE_INVALID`.
3. THE test suite SHALL verify that a valid `subscription_created` event creates a subscription row with status `active`.
4. THE test suite SHALL verify that sending the same event ID twice results in exactly one row in `webhook_events` and the second call returns HTTP 200 with `{ processed: true }`.
5. THE test suite SHALL verify that a valid `subscription_cancelled` event sets the subscription status to `cancelled` and records `cancelled_at`.
6. THE test suite SHALL verify that a `SUBSCRIPTION_CREATED` audit log entry is written after a successful `subscription_created` event.

---

### Requirement 11: E2E Tests — Sign-In Path

**User Story:** As a QA engineer, I want an E2E test for the sign-in flow, so that the authentication path is verified in a real browser against the running application.

#### Acceptance Criteria

1. THE E2E test for sign-in SHALL be located at `tests/e2e/auth.spec.ts`.
2. THE test SHALL verify that a user can navigate to `/login`, enter valid credentials, and be redirected to `/dashboard`.
3. THE test SHALL verify that entering invalid credentials displays an error message on the login page without redirecting.
4. THE test SHALL verify that after successful sign-in, the dashboard displays the user's plan name from `GET /api/usage`.
5. THE E2E tests SHALL use Playwright and SHALL be configured in `playwright.config.ts` at the project root.

---

### Requirement 12: E2E Tests — Generate Path

**User Story:** As a QA engineer, I want an E2E test for the core generation flow, so that the end-to-end path from input to result is verified in a real browser.

#### Acceptance Criteria

1. THE E2E test for generation SHALL be located at `tests/e2e/generate.spec.ts`.
2. THE test SHALL verify that an anonymous user can paste content, select at least one platform, click generate, and see a result card with non-empty content.
3. THE test SHALL verify that clicking the copy button on a result card triggers a clipboard write (or a visible success indicator).
4. THE test SHALL verify that submitting an empty content field displays a validation error and does not call the API.
5. THE test SHALL verify that when the generate API returns `RATE_LIMITED`, the UI displays a user-facing error message.

---

### Requirement 13: E2E Tests — History and Payment Paths

**User Story:** As a QA engineer, I want E2E tests for the history and payment initiation paths, so that authenticated user flows are verified end-to-end.

#### Acceptance Criteria

1. THE E2E test for history SHALL be located at `tests/e2e/history.spec.ts`.
2. THE test SHALL verify that after an authenticated user completes a generation, the generation appears in the `/dashboard/history` list.
3. THE test SHALL verify that an unauthenticated user attempting to access `/dashboard/history` is redirected to `/login`.
4. THE E2E test for payment initiation SHALL be located at `tests/e2e/payment.spec.ts`.
5. THE test SHALL verify that an authenticated user on the `/pricing` page can click an upgrade CTA and be redirected to a Lemon Squeezy checkout URL (the test SHALL verify the redirect occurs, not the full payment flow).
6. THE test SHALL verify that an unauthenticated user clicking an upgrade CTA on `/pricing` is redirected to `/login`.

---

### Requirement 14: v1.0 Launch Acceptance Checklist

**User Story:** As a QA engineer and product owner, I want a structured launch checklist, so that every critical system behavior is verified before the v1.0 production deployment is approved.

#### Acceptance Criteria

1. THE Launch_Checklist SHALL be documented as a verifiable checklist in the design document for this phase, covering: rate limiting, audit logging, moderation, API integration tests, E2E tests, environment variables, and deployment readiness.
2. THE Launch_Checklist SHALL include a check that all required environment variables (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `DASHSCOPE_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `LEMON_VARIANT_CREATOR`, `LEMON_VARIANT_STUDIO`, `LEMON_VARIANT_ENTERPRISE`) are set in the production environment.
3. THE Launch_Checklist SHALL include a check that all M2 P0 integration tests pass in the staging environment.
4. THE Launch_Checklist SHALL include a check that all E2E core path tests pass against the staging deployment.
5. THE Launch_Checklist SHALL include a check that the `audit_logs` table is receiving entries for sign-in and payment events in staging.
6. THE Launch_Checklist SHALL include a check that rate limiting is active and returns HTTP 429 when limits are exceeded in staging.
7. THE Launch_Checklist SHALL include a check that the Lemon Squeezy webhook endpoint is reachable from the internet and signature verification is active.
8. THE Launch_Checklist SHALL include a check that no API key or secret is exposed in client-side JavaScript bundles (verified via `pnpm build` output inspection).
9. THE Launch_Checklist SHALL include a check that the `/api/health` endpoint returns HTTP 200 in the production environment.
10. WHEN all checklist items are verified, THE System SHALL be considered ready for v1.0 production launch.

---

## Correctness Properties

### P1: Rate Limit Counter Monotonicity

For any given Rate_Limit_Key, the counter must increment by exactly 1 on each call to `checkRateLimit` until the limit is reached, and must not exceed the configured limit.

- For all keys and limits, after N calls where N ≤ limit, `remaining` must equal `limit - N`.
- For all keys and limits, after N calls where N > limit, `allowed` must be `false` and `remaining` must be `0`.

### P2: Rate Limit Tier Ordering

The rate limit applied to a request must be consistent with the user's tier — paid users must always receive a higher or equal limit than free users, who must always receive a higher or equal limit than anonymous users.

- For all requests to `/api/generate`: `anonymous_limit ≤ free_limit ≤ paid_limit` must hold for both the per-hour request count and the IP secondary guard.

### P3: Audit Log Non-Blocking

An audit log write failure must never alter the HTTP response status or body of the originating request.

- For all audit log write paths, if `writeAuditLog` throws, the originating route must return the same HTTP status and body it would have returned without the audit log call.

### P4: Moderation Keyword Confidentiality

Matched keywords must never appear in the HTTP response body returned to the client.

- For all requests where `checkContent` returns `{ blocked: true, matchedKeywords: [...] }`, the HTTP 422 response body must not contain any string from `matchedKeywords`.

### P5: Audit Log Completeness for Blocked Content

Every request blocked by moderation must produce exactly one `CONTENT_BLOCKED` audit log entry.

- For all requests where `checkContent` returns `{ blocked: true }`, exactly one row with `action = 'CONTENT_BLOCKED'` must be inserted into `audit_logs` per request.
