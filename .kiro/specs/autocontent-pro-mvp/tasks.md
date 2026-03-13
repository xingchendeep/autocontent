# Implementation Plan: AutoContent Pro MVP (M1 P0)

## Overview

Implement the core generation pipeline in dependency order: shared types and error codes first, then the AI layer, then the API route, then UI components, then the homepage state machine, and finally tests and scaffolding. Each task builds directly on the previous ones with no orphaned code.

Tech stack: Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript strict, Vitest + fast-check.

## Tasks

- [-] 1. Shared types, error codes, and platform templates
  - [x] 1.1 Create `src/types/index.ts` with all shared TypeScript types
    - Define `PlatformCode` union type for all 10 platforms
    - Define `ApiSuccess<T>`, `ApiError`, `GeneratePlatformInput`, `GeneratePlatformOutput`, `GenerateResponse`
    - Define `HistoryRecord` interface
    - _Requirements: 8.1, 8.2, 7.1_

  - [x] 1.2 Create `src/lib/errors/index.ts` with error codes, status map, and factory functions
    - Define `ERROR_CODES` const object with all 10 error codes in `UPPER_SNAKE_CASE`
    - Define `ERROR_STATUS` record mapping each code to its HTTP status
    - Implement `generateRequestId()` using `crypto.randomUUID` with `req_` prefix
    - Implement `createSuccess<T>()` and `createError()` factory functions
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [ ]* 1.3 Write unit tests for error factory (`tests/unit/errors.test.ts`)
    - Test `createSuccess` and `createError` output shapes
    - Test all 10 `ERROR_CODES` are present
    - Test `ERROR_STATUS` mapping for each code
    - _Requirements: 8.1, 8.2, 8.4_

  - [ ]* 1.4 Write property test PBT-11: requestId uniqueness and prefix
    - **Property 11: Request ID uniqueness and prefix**
    - **Validates: Requirements 8.3**
    - Use `fc.integer({ min: 2, max: 100 })` to generate call counts
    - Assert all IDs start with `"req_"` and the set size equals call count

  - [x] 1.5 Create `src/lib/ai/templates.ts` with platform templates
    - Define `PlatformTemplate` interface with all required fields
    - Export `SUPPORTED_PLATFORMS` array with exactly 10 platform codes
    - Export `PLATFORM_TEMPLATES` record with one complete entry per platform (all 10)
    - Each entry must include `platform`, `displayName`, `promptInstructions`, `maxTitleLength`, `maxContentLength`, `hashtagStyle`, `promptVersion`
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [ ]* 1.6 Write unit tests for templates (`tests/unit/templates.test.ts`)
    - Test `SUPPORTED_PLATFORMS` has exactly 10 entries
    - Test each template has all required fields
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 1.7 Write property test PBT-6: all templates complete and versioned
    - **Property 6: All platform templates are complete and versioned**
    - **Validates: Requirements 5.3, 5.5**
    - Use `fc.constantFrom(...SUPPORTED_PLATFORMS)` as arbitrary
    - Assert each template entry has all required fields and non-empty `promptVersion`

- [x] 2. AI provider adapter
  - [x] 2.1 Create `src/lib/ai/provider.ts` with `AIProvider` interface and `DashScopeProvider`
    - Define `AIProvider` interface with `generate(input: GeneratePlatformInput): Promise<GeneratePlatformOutput>`
    - Implement `DashScopeProvider` class reading `DASHSCOPE_API_KEY` from env in constructor
    - Use `AbortSignal.timeout(20_000)` on the fetch call to DashScope's OpenAI-compatible endpoint
    - On timeout or non-2xx response, throw with code `AI_PROVIDER_ERROR`
    - Map successful response to `GeneratePlatformOutput` including `tokensInput`, `tokensOutput`, `model`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 2.2 Write unit tests for provider (`tests/unit/provider.test.ts`)
    - Test timeout after 20s using mocked `AbortSignal`
    - Test successful response maps correctly to `GeneratePlatformOutput`
    - _Requirements: 6.3, 6.4_

  - [ ]* 2.3 Write property test PBT-8: DashScope error → AI_PROVIDER_ERROR
    - **Property 8: DashScope error responses map to AI_PROVIDER_ERROR**
    - **Validates: Requirements 6.5**
    - Use `fc.integer({ min: 400, max: 599 })` to generate non-2xx status codes
    - Mock fetch to return each status; assert thrown error code is `AI_PROVIDER_ERROR`

- [x] 3. Generation service
  - [x] 3.1 Create `src/lib/ai/service.ts` with `generateAll()` function
    - Define `GenerateAllResult` interface
    - Implement `generateAll(content, platforms, options?, provider?)` using `Promise.allSettled`
    - Deduplicate platforms with `[...new Set(platforms)]` before invoking provider
    - Collect fulfilled results into `results`, rejected reasons into `errors`
    - Set `partialFailure` to `true` when `errors` has at least one entry
    - Record wall-clock `durationMs` from start to `Promise.allSettled` resolution
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 3.2 Write unit tests for generation service (`tests/unit/service.test.ts`)
    - Test all-fail scenario: `partialFailure: true`, empty `results`
    - Test `durationMs` is a positive number
    - _Requirements: 7.2, 7.3, 7.4_

  - [ ]* 3.3 Write property test PBT-9: partial failure invariant
    - **Property 9: Generation service partial failure invariant**
    - **Validates: Requirements 7.2, 7.3**
    - Use `fc.array(fc.constantFrom(...SUPPORTED_PLATFORMS), { minLength: 1 })` with mocked outcomes
    - Assert `partialFailure` is `true` iff `errors` is non-empty; `results` contains all successes

  - [ ]* 3.4 Write property test PBT-10: deduplication of platforms
    - **Property 10: Generation service deduplicates platforms**
    - **Validates: Requirements 7.5**
    - Use `fc.array(fc.constantFrom(...SUPPORTED_PLATFORMS), { minLength: 1 })` with duplicates
    - Assert `provider.generate` call count equals number of distinct platform codes

- [x] 4. POST /api/generate route
  - [x] 4.1 Create `src/app/api/generate/route.ts`
    - Define Zod schema for request body: `content` (string, 1–100000), `platforms` (array of 1–10 supported codes), `source` (optional enum), `options.tone` and `options.length` (optional enums)
    - Use `safeParse`; map Zod errors to `INVALID_INPUT` with `ZodError.flatten()` in details
    - Check for unknown platform codes → `INVALID_PLATFORM` (400)
    - Check `content.length > 100000` → `CONTENT_TOO_LONG` (400)
    - Call `generateAll()`; if all platforms fail → `AI_PROVIDER_ERROR` (500)
    - Return `ApiSuccess<GenerateResponse>` on success (200) or partial failure (200 with `partialFailure: true`)
    - Set `x-request-id` response header to match `requestId` in body
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ]* 4.2 Write property test PBT-7: unknown platform → INVALID_PLATFORM
    - **Property 7: Unknown platform codes produce INVALID_PLATFORM error**
    - **Validates: Requirements 5.4, 9.4**
    - Use `fc.string().filter(s => !SUPPORTED_PLATFORMS.includes(s as PlatformCode))` as arbitrary
    - Call route handler with unknown platform; assert 400 and `INVALID_PLATFORM` code

  - [ ]* 4.3 Write property test PBT-12: API response shape invariant
    - **Property 12: API response always contains requestId, timestamp, and matching header**
    - **Validates: Requirements 9.7, 9.8**
    - Use `fc.record({ content: fc.string({ minLength: 1, maxLength: 100 }), platforms: fc.array(fc.constantFrom(...SUPPORTED_PLATFORMS), { minLength: 1, maxLength: 3 }) })`
    - Assert response body has `requestId` starting with `"req_"`, valid ISO 8601 `timestamp`, and `x-request-id` header equals `requestId`

  - [ ]* 4.4 Write integration tests for `/api/generate` (`tests/integration/generate.test.ts`)
    - Test valid POST → 200 with correct `ApiSuccess` shape
    - Test invalid body → 400 `INVALID_INPUT`
    - Test content too long → 400 `CONTENT_TOO_LONG`
    - Test all platforms fail → 500 `AI_PROVIDER_ERROR`
    - Test `x-request-id` header matches body `requestId`
    - Mock DashScope API with `msw` or Vitest mocks
    - _Requirements: 9.1, 9.3, 9.5, 9.6, 9.7, 9.8_

- [x] 5. Checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [-] 6. UI components
  - [x] 6.1 Create `src/components/generate/ContentInput.tsx`
    - Render `<textarea>` accepting plain text
    - Display live character count as `{n} / 100000`
    - Show required error when empty on submit attempt; show length error when >100000 chars
    - Accept `value`, `onChange`, `disabled`, `error` props
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 6.2 Write property test PBT-1: character count display accuracy
    - **Property 1: Character count display accuracy**
    - **Validates: Requirements 3.2, 3.5**
    - Use `fc.string({ maxLength: 100000 })` as arbitrary
    - Render component and assert counter text equals `"{n} / 100000"` and stored value is unchanged

  - [ ]* 6.3 Write property test PBT-2: over-limit input triggers error state
    - **Property 2: Over-limit input triggers error state**
    - **Validates: Requirements 3.3**
    - Use `fc.string({ minLength: 100001 })` as arbitrary
    - Assert error message is visible and form submission is blocked

  - [ ]* 6.4 Write property test PBT-3: clear resets ContentInput state
    - **Property 3: Clear resets ContentInput state**
    - **Validates: Requirements 3.6**
    - Use `fc.string({ minLength: 1 })` as arbitrary
    - Populate component, then set value to `""`; assert count is `0` and no error indicators

  - [x] 6.5 Create `src/components/generate/PlatformSelector.tsx`
    - Render 10 platform cards in a responsive grid using `PLATFORM_TEMPLATES` for display names
    - Implement toggle on card click; include "全选/取消全选" control
    - Visually distinguish selected vs unselected cards (border/background)
    - Accept `selected`, `onChange`, `disabled` props
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_

  - [ ]* 6.6 Write property test PBT-4: platform cards display correct names
    - **Property 4: Platform cards display correct names**
    - **Validates: Requirements 4.2**
    - Use `fc.constantFrom(...SUPPORTED_PLATFORMS)` as arbitrary
    - Render component and assert each card's visible text includes `PLATFORM_TEMPLATES[platform].displayName`

  - [ ]* 6.7 Write property test PBT-5: platform card toggle is idempotent over two clicks
    - **Property 5: Platform card toggle is idempotent over two clicks**
    - **Validates: Requirements 4.3**
    - Use `fc.constantFrom(...SUPPORTED_PLATFORMS)` as arbitrary
    - Click card twice; assert selection returns to original state

  - [x] 6.8 Create `src/components/generate/GenerateButton.tsx`
    - Render a button that is disabled when `loading` or `disabled` is true
    - Show spinner during `loading`; show tooltip/label when disabled due to zero platforms
    - Accept `onClick`, `loading`, `disabled` props
    - _Requirements: 4.6, 10.2_

  - [x] 6.9 Create `src/components/generate/ResultCard.tsx`
    - Display platform name, generated title (if present), content body, and hashtags (if present)
    - Include copy-to-clipboard button; show brief success toast on successful copy
    - Render error state when `result` is null and `error` is set
    - Accept `platform`, `result`, `error` props
    - _Requirements: 10.7, 10.8, 10.9_

  - [x] 6.10 Create `src/components/layout/Hero.tsx`
    - Display product name "AutoContent Pro" and a one-sentence value proposition
    - _Requirements: 2.5_

- [x] 7. Local history module
  - [x] 7.1 Create `src/lib/localHistory.ts`
    - Implement `readHistory()`, `prependHistory(record)`, `clearHistory()` functions
    - Store under `localStorage` key `acp_history`; cap at 10 records (discard oldest)
    - Wrap all `localStorage` calls in try/catch; fail silently on error
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 7.2 Write unit tests for local history (`tests/unit/history.test.ts`)
    - Test silent failure when `localStorage` is unavailable
    - Test `clearHistory` empties the list
    - _Requirements: 11.4_

  - [ ]* 7.3 Write property test PBT-13: LocalHistory cap and round-trip
    - **Property 13: LocalHistory cap and round-trip**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.5**
    - Use `fc.array(fc.record({ id: fc.string(), platforms: fc.array(fc.constantFrom(...SUPPORTED_PLATFORMS), { minLength: 1 }), inputSnippet: fc.string({ maxLength: 100 }), createdAt: fc.string(), results: fc.constant({}) }), { minLength: 1, maxLength: 20 })` as arbitrary
    - Assert `readHistory()` returns at most 10 records; most recent is first; all required fields present

- [x] 8. Homepage layout and state machine
  - [x] 8.1 Create `src/app/layout.tsx`
    - Set `lang="zh-CN"` on `<html>`; apply global Tailwind CSS styles
    - _Requirements: 2.1_

  - [x] 8.2 Create `src/app/page.tsx` with `useReducer` state machine
    - Manage `UIState`: `idle | loading | success | error`
    - Render sections in order: Hero, ContentInput, PlatformSelector, GenerateButton, results, history
    - Apply centered single-column layout with `max-w-[800px]`; full-width below 768px
    - Disable `ContentInput`, `PlatformSelector`, `GenerateButton` during `loading`
    - On success: render one `ResultCard` per returned platform; handle `partialFailure` inline errors
    - On error: display error message from API response
    - On clear: transition back to `idle`
    - After successful generation: call `prependHistory` with the new record
    - On history record click: restore results into results section
    - _Requirements: 2.2, 2.3, 2.4, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.3, 11.6_

- [x] 9. Project scaffolding
  - [x] 9.1 Create `.env.example` listing all required environment variable keys without values
    - Include `DASHSCOPE_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_WEBHOOK_SECRET`
    - _Requirements: 1.5_

  - [x] 9.2 Create `supabase/migrations/.gitkeep` as an empty placeholder
    - _Requirements: 1.4_

  - [x] 9.3 Verify `tsconfig.json` has `@/` path alias resolving to `src/`
    - Confirm `paths: { "@/*": ["./src/*"] }` is present in `tsconfig.json`
    - _Requirements: 1.3, 1.6_

- [x] 10. Vercel deployment configuration
  - [x] 10.1 Create `vercel.json` with basic project configuration
    - Set `framework` to `nextjs`
    - Configure `buildCommand` and `outputDirectory` if needed
    - _Requirements: 1.1 (project scaffolding)_

  - [x] 10.2 Verify environment variables are documented for Vercel
    - Confirm `.env.example` covers all keys required by the Vercel project settings
    - Add `APP_URL` and `NODE_ENV` to `.env.example` if not already present
    - _Requirements: 1.5_

  - [x] 10.3 Verify `next.config.ts` is production-ready
    - Ensure no dev-only settings that would break Vercel build
    - Confirm TypeScript and ESLint errors do not silently pass during build (`ignoreBuildErrors: false`)
    - _Requirements: 1.1_

- [x] 11. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints at tasks 5 and 10 ensure incremental validation
- Property tests use fast-check with a minimum of 100 runs each (`{ numRuns: 100 }`)
- Unit tests and property tests are complementary — both are needed for full coverage
- The `DashScopeProvider` must never be instantiated client-side; it reads `DASHSCOPE_API_KEY` server-side only
