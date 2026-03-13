# Requirements Document

## Introduction

AutoContent Pro MVP Foundation — M1 P0 scope only.

The goal is to build the core generation pipeline: project scaffolding, homepage layout, content input, platform selector, and the `/api/generate` skeleton. This enables the primary user flow: paste a video script → select platforms → generate platform-specific copy → copy results. No login required for MVP.

Tech stack: Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS v4, DashScope/Tongyi Qianwen AI.

---

## Glossary

- **System**: The AutoContent Pro web application
- **Generator**: The server-side service responsible for calling the AI provider and assembling multi-platform results
- **AI_Provider**: The DashScope/Tongyi Qianwen adapter that wraps the upstream model API
- **Platform_Template**: A configuration object that defines the prompt rules, tone, structure, and constraints for a specific social platform
- **ContentInput**: The React component that accepts user-supplied text (video script or description)
- **PlatformSelector**: The React component that lets users choose one or more target platforms
- **ResultCard**: The React component that displays generated copy for a single platform
- **GenerateButton**: The React component that triggers the generation request
- **Validator**: The server-side Zod schema that validates incoming request bodies
- **ErrorFactory**: The utility that produces typed `ApiError` response objects with consistent shape
- **LocalHistory**: The browser `localStorage` manager that persists the last 10 generation records
- **PLATFORMS**: The fixed set of 10 supported platform codes: `douyin`, `xiaohongshu`, `bilibili`, `weibo`, `wechat`, `twitter`, `linkedin`, `kuaishou`, `zhihu`, `toutiao`

---

## Requirements

### Requirement 1: Project Structure and Directory Layout

**User Story:** As a developer, I want a well-structured project directory, so that all modules are easy to locate and the codebase is maintainable from day one.

#### Acceptance Criteria

1. THE System SHALL provide a `src/` directory containing `app/`, `components/`, `lib/`, and `types/` subdirectories.
2. THE System SHALL provide a `tests/` directory containing `unit/`, `integration/`, and `e2e/` subdirectories.
3. THE System SHALL configure the `@/` TypeScript path alias to resolve to `src/`.
4. THE System SHALL provide a `supabase/migrations/` directory for future database migrations.
5. THE System SHALL provide a `.env.example` file listing all required environment variable keys without values.
6. WHEN a module imports using the `@/` alias, THE System SHALL resolve the import correctly at both compile time and runtime.

---

### Requirement 2: Base UI Layout and Global Styles

**User Story:** As a content creator, I want a clean, readable homepage, so that I can immediately understand how to use the tool.

#### Acceptance Criteria

1. THE System SHALL render a root layout that applies global Tailwind CSS styles and sets the document language to `zh-CN`.
2. THE System SHALL render a homepage that contains a Hero section, a content input section, a platform selection section, a results section, and a local history section — in that vertical order.
3. WHILE the viewport width is 768px or wider, THE System SHALL display the homepage in a single-column centered layout with a maximum width of 800px.
4. WHILE the viewport width is below 768px, THE System SHALL display the homepage in a full-width single-column layout with appropriate horizontal padding.
5. THE System SHALL display the product name "AutoContent Pro" and a one-sentence value proposition in the Hero section.

---

### Requirement 3: Content Input Component

**User Story:** As a content creator, I want to paste my video script into a text area, so that I can provide the source material for generation.

#### Acceptance Criteria

1. THE ContentInput SHALL render a multi-line textarea that accepts plain text input.
2. THE ContentInput SHALL display a live character count in the format `{n} / 100000`.
3. WHEN the user's input exceeds 100000 characters, THE ContentInput SHALL display a visible error message and prevent form submission.
4. WHEN the textarea is empty and the user attempts to submit, THE ContentInput SHALL display a visible error message indicating that content is required.
5. THE ContentInput SHALL support pasting text of up to 100000 characters without data loss or truncation.
6. WHEN the user clears the textarea, THE ContentInput SHALL reset the character count to zero and remove any error state.

---

### Requirement 4: Platform Selector Component

**User Story:** As a content creator, I want to select one or more target platforms, so that I receive copy tailored to each platform's style.

#### Acceptance Criteria

1. THE PlatformSelector SHALL render a selectable card for each of the 10 platforms in PLATFORMS.
2. THE PlatformSelector SHALL display the platform's display name and a recognizable icon or label on each card.
3. WHEN the user clicks a platform card, THE PlatformSelector SHALL toggle that platform's selected state.
4. THE PlatformSelector SHALL provide a "全选" (Select All) control that selects all 10 platforms.
5. WHEN all platforms are selected and the user clicks "全选", THE PlatformSelector SHALL deselect all platforms.
6. WHEN zero platforms are selected, THE GenerateButton SHALL be disabled and display a tooltip or label indicating that at least one platform must be selected.
7. THE PlatformSelector SHALL visually distinguish selected platforms from unselected ones using a clear style difference (e.g., border color, background).

---

### Requirement 5: Platform Templates and Enumerations

**User Story:** As a developer, I want platform templates defined in a single configuration file, so that prompt logic is decoupled from business code and easy to iterate.

#### Acceptance Criteria

1. THE System SHALL define a `SUPPORTED_PLATFORMS` constant array containing exactly the 10 platform codes in PLATFORMS.
2. THE System SHALL define a `PlatformTemplate` type with fields: `platform`, `displayName`, `promptInstructions`, `maxTitleLength`, `maxContentLength`, `hashtagStyle`, and `promptVersion`.
3. THE System SHALL export a `PLATFORM_TEMPLATES` record from `src/lib/ai/templates.ts` containing one entry per platform in PLATFORMS.
4. WHEN a platform code is not present in `PLATFORM_TEMPLATES`, THE Generator SHALL treat it as an unsupported platform and return an `INVALID_PLATFORM` error.
5. THE System SHALL include a `promptVersion` string field in each template so that prompt changes are traceable.

---

### Requirement 6: AI Provider Adapter

**User Story:** As a developer, I want a single adapter layer for the AI provider, so that the upstream model can be swapped without changing business logic.

#### Acceptance Criteria

1. THE System SHALL define an `AIProvider` interface with a `generate(input: GeneratePlatformInput): Promise<GeneratePlatformOutput>` method.
2. THE System SHALL implement a `DashScopeProvider` class that satisfies the `AIProvider` interface using the DashScope API.
3. WHEN the DashScope API call succeeds, THE DashScopeProvider SHALL return a `GeneratePlatformOutput` containing `content`, `tokensInput`, `tokensOutput`, and `model`.
4. WHEN the DashScope API call does not respond within 20 seconds, THE DashScopeProvider SHALL throw a timeout error with code `AI_PROVIDER_ERROR`.
5. WHEN the DashScope API returns a non-success status, THE DashScopeProvider SHALL throw an error with code `AI_PROVIDER_ERROR` and include the upstream error message in the details.
6. THE System SHALL read the DashScope API key exclusively from the `DASHSCOPE_API_KEY` server-side environment variable and SHALL NOT expose it to the client.

---

### Requirement 7: Generation Service

**User Story:** As a content creator, I want all selected platforms to be generated in parallel, so that I receive results quickly regardless of how many platforms I selected.

#### Acceptance Criteria

1. THE Generator SHALL accept a `content` string and a `platforms` string array and invoke the AI_Provider for each platform concurrently using `Promise.allSettled`.
2. WHEN all platform generations succeed, THE Generator SHALL return a `results` record with one entry per platform and set `partialFailure` to `false`.
3. WHEN one or more platform generations fail, THE Generator SHALL still return results for the successful platforms and set `partialFailure` to `true`.
4. THE Generator SHALL record `tokensInput`, `tokensOutput`, and `durationMs` for the overall generation call.
5. WHEN the `platforms` array contains a duplicate platform code, THE Generator SHALL deduplicate it before invoking the AI_Provider.
6. THE Generator SHALL apply the corresponding `PlatformTemplate` prompt instructions when constructing the prompt for each platform.

---

### Requirement 8: Unified API Response and Error Model

**User Story:** As a developer, I want all API routes to return a consistent response shape, so that the frontend can handle success and error cases uniformly.

#### Acceptance Criteria

1. THE System SHALL define an `ApiSuccess<T>` type with fields: `success: true`, `data: T`, `requestId: string`, `timestamp: string`.
2. THE System SHALL define an `ApiError` type with fields: `success: false`, `error: { code: string; message: string; details?: Record<string, unknown> }`, `requestId: string`, `timestamp: string`.
3. THE ErrorFactory SHALL generate a unique `requestId` for every response using a `req_` prefix followed by a random identifier.
4. THE System SHALL define error code constants in `UPPER_SNAKE_CASE` covering at minimum: `INVALID_INPUT`, `INVALID_PLATFORM`, `CONTENT_TOO_LONG`, `UNAUTHORIZED`, `PLAN_LIMIT_REACHED`, `CONTENT_BLOCKED`, `RATE_LIMITED`, `AI_PROVIDER_ERROR`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`.
5. WHEN an API route returns an error, THE System SHALL set the HTTP status code to match the error code as defined in API_SPEC.md section 4.

---

### Requirement 9: POST /api/generate Endpoint

**User Story:** As a content creator, I want to submit my script and selected platforms via an API call, so that the server generates platform-specific copy and returns it.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/generate` with a valid body, THE System SHALL invoke the Generator and return an `ApiSuccess<GenerateResponse>` with HTTP 200.
2. THE Validator SHALL validate the request body against the schema: `content` (string, 1–100000 chars), `platforms` (array of 1–10 supported platform codes), `source` (optional enum: `manual` | `extract`), `options.tone` (optional enum: `professional` | `casual` | `humorous`), `options.length` (optional enum: `short` | `medium` | `long`).
3. WHEN the request body fails Zod validation, THE System SHALL return HTTP 400 with error code `INVALID_INPUT` and field-level details.
4. WHEN `platforms` contains an unsupported platform code, THE System SHALL return HTTP 400 with error code `INVALID_PLATFORM`.
5. WHEN `content` exceeds 100000 characters, THE System SHALL return HTTP 400 with error code `CONTENT_TOO_LONG`.
6. WHEN the AI_Provider returns an error for all platforms, THE System SHALL return HTTP 500 with error code `AI_PROVIDER_ERROR`.
7. THE System SHALL include `requestId` and `timestamp` in every response from `/api/generate`.
8. THE System SHALL set the `x-request-id` response header to the same value as `requestId` in the response body.

---

### Requirement 10: Homepage State Management and Generation Flow

**User Story:** As a content creator, I want the page to guide me through the generation flow with clear loading and error states, so that I always know what is happening.

#### Acceptance Criteria

1. THE System SHALL manage the following UI states on the homepage: `idle`, `loading`, `success`, `error`.
2. WHILE the state is `loading`, THE GenerateButton SHALL be disabled and display a spinner or loading indicator.
3. WHILE the state is `loading`, THE ContentInput and PlatformSelector SHALL be disabled to prevent modification during generation.
4. WHEN the generation API call succeeds, THE System SHALL transition to `success` state and render one ResultCard per returned platform.
5. WHEN the generation API call fails, THE System SHALL transition to `error` state and display the error message returned by the API.
6. WHEN `partialFailure` is `true` in the response, THE System SHALL render a ResultCard for each successful platform and display an inline error indicator on each failed platform card.
7. THE ResultCard SHALL display the platform name, generated title (if present), generated content body, and hashtags (if present).
8. THE ResultCard SHALL include a copy button that writes the full generated text to the clipboard.
9. WHEN the copy button is clicked and the clipboard write succeeds, THE System SHALL display a brief success toast or inline confirmation.

---

### Requirement 11: Local History Storage

**User Story:** As a content creator, I want my recent generations to be saved locally, so that I can review them after refreshing the page.

#### Acceptance Criteria

1. THE LocalHistory SHALL persist generation records to `localStorage` under the key `acp_history`.
2. WHEN a generation succeeds, THE LocalHistory SHALL prepend the new record and retain at most 10 records, discarding the oldest.
3. WHEN the page loads, THE LocalHistory SHALL read and display the stored records in the history section.
4. WHEN `localStorage` is unavailable or throws an error, THE LocalHistory SHALL fail silently and not block the generation flow.
5. THE LocalHistory SHALL store for each record: `id`, `platforms`, `inputSnippet` (first 100 chars of input), `createdAt`, and `results`.
6. WHEN the user clicks a history record, THE System SHALL restore the results into the results section for review.
