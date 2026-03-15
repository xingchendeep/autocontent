# Requirements Document

## Introduction

Phase 4 of AutoContent Pro v1.0 introduces payments and monetization. This phase adds a pricing page, Lemon Squeezy checkout session creation, webhook-driven subscription state synchronization, a subscription management page, and live enforcement of plan capability limits. It depends on Phase 1 (MVP), Phase 2 (Supabase Infrastructure), and Phase 3 (Cloud Data & Plan Foundation) being complete. The `getPlanCapability` service, `plans`/`subscriptions`/`webhook_events` schema, and `current_active_subscriptions` view are all pre-existing and must not be redesigned here.

## Glossary

- **Checkout_API**: The `POST /api/checkout` route that creates a Lemon Squeezy checkout session.
- **Webhook_Handler**: The `POST /api/webhooks/lemon` route that receives and processes Lemon Squeezy webhook events.
- **Lemon_Squeezy_SDK**: The server-side Lemon Squeezy client library used to create checkout sessions and verify webhook signatures.
- **Plan_Capability_Service**: The existing `getPlanCapability(userId)` function in `src/lib/billing/plan-capability.ts` — reads the active subscription from `current_active_subscriptions` and falls back to the free plan.
- **Pricing_Page**: The public-facing page at `/pricing` that displays plan comparison and upgrade CTAs.
- **Subscription_Management_Page**: The authenticated page at `/dashboard/subscription` that shows the user's current plan and provides upgrade, downgrade, and cancellation entry points.
- **Webhook_Event**: A signed HTTP POST from Lemon Squeezy carrying a subscription lifecycle event.
- **Subscription_Status**: One of `active`, `cancelled`, `expired`, `past_due`, `trialing`, `paused` — as constrained in the `subscriptions` table.
- **Plan_Code**: One of `free`, `creator`, `studio`, `enterprise`.
- **Variant_ID**: The Lemon Squeezy product variant identifier mapped from a Plan_Code via environment variables (`LEMON_VARIANT_CREATOR`, `LEMON_VARIANT_STUDIO`, `LEMON_VARIANT_ENTERPRISE`).
- **Idempotency_Key**: The combination of `provider` + `event_id` used as a unique constraint in `webhook_events` to prevent duplicate processing.
- **Generate_Route**: The existing `POST /api/generate` route that produces AI copy.
- **Platform_Limit**: The `maxPlatforms` field from `PlanCapability` — `null` means unlimited.
- **Monthly_Generation_Limit**: The `monthlyGenerationLimit` field from `PlanCapability` — `null` means unlimited.

---

## Requirements

### Requirement 1: Pricing Page

**User Story:** As a visitor or authenticated user, I want to view a clear plan comparison page, so that I can understand the differences between plans and choose one to purchase.

#### Acceptance Criteria

1. THE Pricing_Page SHALL display all four plans (`free`, `creator`, `studio`, `enterprise`) with their price, generation limit, platform limit, and speed tier.
2. THE Pricing_Page SHALL be publicly accessible without authentication.
3. WHEN an authenticated user clicks an upgrade CTA on the Pricing_Page, THE Pricing_Page SHALL initiate a checkout flow by calling the Checkout_API with the selected Plan_Code.
4. WHEN an unauthenticated user clicks an upgrade CTA on the Pricing_Page, THE Pricing_Page SHALL redirect the user to `/login` before initiating checkout.
5. WHEN the Checkout_API returns a `checkoutUrl`, THE Pricing_Page SHALL redirect the user to that URL.
6. IF the Checkout_API returns an error, THEN THE Pricing_Page SHALL display an inline error message without navigating away.
7. THE Pricing_Page SHALL highlight the user's current plan when the user is authenticated.

---

### Requirement 2: Checkout Session Creation (POST /api/checkout)

**User Story:** As an authenticated user, I want to start a checkout session for a paid plan, so that I can complete payment through Lemon Squeezy.

#### Acceptance Criteria

1. WHEN a valid request is received with an authenticated session and a valid paid Plan_Code, THE Checkout_API SHALL call the Lemon_Squeezy_SDK to create a checkout session and return `{ checkoutUrl, provider: "lemonsqueezy" }` with HTTP 200.
2. WHEN the request body contains an invalid or missing `planCode`, THE Checkout_API SHALL return HTTP 400 with error code `INVALID_INPUT`.
3. WHEN the request body contains `planCode: "free"`, THE Checkout_API SHALL return HTTP 400 with error code `INVALID_INPUT`.
4. WHEN the request is made without a valid session, THE Checkout_API SHALL return HTTP 401 with error code `UNAUTHORIZED`.
5. THE Checkout_API SHALL validate the request body with Zod before calling the Lemon_Squeezy_SDK.
6. THE Checkout_API SHALL map the Plan_Code to a Variant_ID using the environment variables `LEMON_VARIANT_CREATOR`, `LEMON_VARIANT_STUDIO`, and `LEMON_VARIANT_ENTERPRISE`.
7. IF the Lemon_Squeezy_SDK call fails, THEN THE Checkout_API SHALL return HTTP 503 with error code `SERVICE_UNAVAILABLE`.
8. THE Checkout_API SHALL return responses in the `ApiSuccess<T>` / `ApiError` envelope with `requestId` and `timestamp`.

---

### Requirement 3: Lemon Squeezy Webhook Handler (POST /api/webhooks/lemon)

**User Story:** As the system, I want to receive and process Lemon Squeezy webhook events, so that subscription state in the database stays authoritative and up to date.

#### Acceptance Criteria

1. WHEN a webhook request is received, THE Webhook_Handler SHALL verify the HMAC-SHA256 signature in the `x-signature` header against the raw request body using `LEMONSQUEEZY_WEBHOOK_SECRET`.
2. IF the signature is invalid or missing, THEN THE Webhook_Handler SHALL return HTTP 401 with error code `WEBHOOK_SIGNATURE_INVALID` and take no further action.
3. THE Webhook_Handler SHALL use the `webhook_events` table's unique constraint on `(provider, event_id)` to enforce idempotency — a duplicate event_id SHALL be acknowledged with HTTP 200 and `{ processed: true }` without re-processing.
4. WHEN a `subscription_created` event is received, THE Webhook_Handler SHALL insert or update a row in the `subscriptions` table with status `active`.
5. WHEN a `subscription_updated` event is received, THE Webhook_Handler SHALL update the matching subscription row with the new fields from the event payload.
6. WHEN a `subscription_cancelled` event is received, THE Webhook_Handler SHALL set the subscription status to `cancelled` and record `cancelled_at`.
7. WHEN a `subscription_expired` event is received, THE Webhook_Handler SHALL set the subscription status to `expired`.
8. WHEN an `order_created` event is received, THE Webhook_Handler SHALL record the event metadata in `webhook_events` without modifying the `subscriptions` table.
9. THE Webhook_Handler SHALL record every successfully verified event in the `webhook_events` table before processing subscription changes.
10. THE Webhook_Handler SHALL return HTTP 200 with `{ processed: true }` for all successfully handled events.
11. IF a database write fails during event processing, THEN THE Webhook_Handler SHALL return HTTP 500 with error code `INTERNAL_ERROR`.
12. THE Webhook_Handler SHALL NOT use session-based authentication — signature verification is the sole authentication mechanism.

---

### Requirement 4: Subscription State Machine

**User Story:** As the system, I want subscription status transitions to follow valid paths, so that billing state remains consistent.

#### Acceptance Criteria

1. THE Webhook_Handler SHALL only write Subscription_Status values that are members of the set `{ active, cancelled, expired, past_due, trialing, paused }`.
2. WHEN a `subscription_cancelled` event is received for a subscription that is already `cancelled`, THE Webhook_Handler SHALL treat the event as a no-op and return HTTP 200 with `{ processed: true }`.
3. WHEN a `subscription_expired` event is received for a subscription that is already `expired`, THE Webhook_Handler SHALL treat the event as a no-op and return HTTP 200 with `{ processed: true }`.
4. THE Webhook_Handler SHALL NOT transition a subscription from `expired` to `active` via a `subscription_updated` event — only `subscription_created` may set status to `active`.

---

### Requirement 5: Subscription Management Page

**User Story:** As an authenticated user, I want to view and manage my current subscription, so that I can upgrade, downgrade, or cancel my plan.

#### Acceptance Criteria

1. THE Subscription_Management_Page SHALL be accessible only to authenticated users; unauthenticated access SHALL redirect to `/login`.
2. THE Subscription_Management_Page SHALL display the user's current Plan_Code, display name, billing period, and Subscription_Status by calling `GET /api/usage`.
3. WHEN the user's Subscription_Status is `active` or `trialing`, THE Subscription_Management_Page SHALL display upgrade and downgrade options for other paid plans.
4. WHEN the user's Subscription_Status is `active` or `trialing`, THE Subscription_Management_Page SHALL display a cancellation entry point that initiates a new checkout or redirects to the Lemon Squeezy customer portal.
5. WHEN the user's Subscription_Status is `cancelled` or `expired`, THE Subscription_Management_Page SHALL display a resubscribe CTA that links to the Pricing_Page.
6. WHEN the user clicks an upgrade or downgrade option, THE Subscription_Management_Page SHALL call the Checkout_API and redirect to the returned `checkoutUrl`.
7. IF the Checkout_API returns an error, THEN THE Subscription_Management_Page SHALL display an inline error message without navigating away.
8. THE Subscription_Management_Page SHALL reflect subscription state sourced from the database via `GET /api/usage`, not from client-side redirect parameters.

---

### Requirement 6: Plan Capability Enforcement

**User Story:** As the system, I want to enforce plan limits on the generation route, so that users cannot exceed their plan's platform count or monthly generation quota.

#### Acceptance Criteria

1. WHEN an authenticated user submits a generation request, THE Generate_Route SHALL call `getPlanCapability(userId)` to retrieve the user's current plan limits.
2. WHEN the number of selected platforms in the request exceeds the user's Platform_Limit, THE Generate_Route SHALL return HTTP 402 with error code `PLAN_LIMIT_REACHED` before calling the AI provider.
3. WHEN the user's monthly generation count meets or exceeds the Monthly_Generation_Limit, THE Generate_Route SHALL return HTTP 402 with error code `PLAN_LIMIT_REACHED` before calling the AI provider.
4. WHILE the user's Platform_Limit is `null` (unlimited plan), THE Generate_Route SHALL not apply a platform count restriction.
5. WHILE the user's Monthly_Generation_Limit is `null` (unlimited plan), THE Generate_Route SHALL not apply a monthly generation count restriction.
6. WHEN an anonymous user submits a generation request, THE Generate_Route SHALL apply the free plan limits using the existing IP-based rate limiting from Phase 1 — plan capability enforcement via `getPlanCapability` SHALL only apply to authenticated users.
7. IF `getPlanCapability` throws an error, THEN THE Generate_Route SHALL return HTTP 503 with error code `SERVICE_UNAVAILABLE`.

---

### Requirement 7: Lemon Squeezy SDK Integration

**User Story:** As a developer, I want a clean server-side adapter for the Lemon Squeezy SDK, so that checkout and webhook logic is isolated from route handlers.

#### Acceptance Criteria

1. THE Lemon_Squeezy_SDK SHALL be initialized server-side only using `LEMONSQUEEZY_API_KEY` — the key SHALL never be exposed to client-side code.
2. THE Lemon_Squeezy_SDK adapter SHALL expose a `createCheckoutSession(variantId, userId, successUrl, cancelUrl)` function that returns a `checkoutUrl` string.
3. THE Lemon_Squeezy_SDK adapter SHALL expose a `verifyWebhookSignature(rawBody, signature, secret)` function that returns a boolean.
4. THE Lemon_Squeezy_SDK adapter SHALL live in `src/lib/billing/` and SHALL NOT be imported by any client-side component.

---

## Correctness Properties

### P1: Webhook Idempotency

Processing the same `event_id` twice must not create duplicate subscriptions or duplicate `webhook_events` rows.

- For all valid webhook payloads with a given `event_id`, calling the Webhook_Handler twice with the same payload must result in exactly one row in `webhook_events` and at most one subscription mutation.
- The second call must return HTTP 200 with `{ processed: true }`.

### P2: Signature Verification Soundness

Any webhook request with a tampered payload or incorrect signature must be rejected.

- For all valid `(payload, secret)` pairs, mutating any byte of the payload or the signature must cause `verifyWebhookSignature` to return `false`.
- The Webhook_Handler must return HTTP 401 with `WEBHOOK_SIGNATURE_INVALID` for any request where `verifyWebhookSignature` returns `false`.

### P3: Subscription Status Machine Validity

Only status values from the allowed set may be written to the `subscriptions` table.

- For all webhook event types, the resulting `status` written to `subscriptions` must be a member of `{ active, cancelled, expired, past_due, trialing, paused }`.
- No event type may produce a status value outside this set.

### P4: Plan Capability Enforcement Completeness

Users whose usage meets or exceeds their plan limit must always receive `PLAN_LIMIT_REACHED`.

- For all authenticated users where `monthlyGenerationCount >= monthlyGenerationLimit` (when limit is not null), the Generate_Route must return HTTP 402 with `PLAN_LIMIT_REACHED`.
- For all authenticated users where `selectedPlatforms.length > maxPlatforms` (when limit is not null), the Generate_Route must return HTTP 402 with `PLAN_LIMIT_REACHED`.
- For all users where the relevant limit is `null`, the Generate_Route must not return `PLAN_LIMIT_REACHED` on that dimension.

### P5: Checkout Authentication Gate

Only authenticated users with a valid paid Plan_Code may receive a checkout URL.

- For all requests to the Checkout_API without a valid session, the response must be HTTP 401.
- For all requests with `planCode: "free"` or an unrecognized plan code, the response must be HTTP 400.
- For all valid authenticated requests with a paid Plan_Code, the response must contain a non-empty `checkoutUrl`.
