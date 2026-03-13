# Project Structure

## Root Layout
```
src/
  app/          # Next.js App Router pages and API routes
  components/   # Reusable React components
  lib/          # Business logic, services, third-party adapters
  types/        # Shared TypeScript type definitions
tests/
  unit/
  integration/
  e2e/
```

## App Directory
```
src/app/
  (marketing)/        # Public-facing pages (landing, pricing)
  dashboard/          # Authenticated user pages
  api/
    generate/         # POST - AI copy generation
    extract/          # POST - Video URL content extraction
    history/          # GET - Paginated generation history
    usage/            # GET - Usage stats
    checkout/         # POST - Lemon Squeezy checkout session
    webhooks/lemon/   # POST - Payment webhook handler
    health/           # GET - Health check
```

## Components Directory
```
src/components/
  forms/        # Input forms
  generate/     # Generation flow UI (ContentInput, PlatformSelector, ResultCard, GenerateButton)
  layout/       # Shell, nav, page wrappers
```

## Lib Directory
```
src/lib/
  ai/           # AI provider adapter + platform templates (templates.ts)
  auth/         # Supabase auth helpers
  db/           # Database access layer
  extract/      # Video URL content extractor
  billing/      # Lemon Squeezy checkout + webhook handling
  analytics/    # Event tracking
  rate-limit/   # Upstash-based rate limiting
  moderation/   # Content safety / keyword filtering
  logger/       # Structured logging with requestId
  errors/       # Error codes and error factory
```

## Key Conventions
- Import via `@/` alias (e.g. `@/lib/ai/templates`)
- Page-level logic stays in `app/`, business logic goes in `lib/`
- Third-party SDK wrappers always live in `lib/` — never inline in routes
- Platform templates are config-driven in `lib/ai/templates.ts`, not hardcoded in components
- DB schema and migrations live in `supabase/migrations/`
- Types shared across layers go in `src/types/`, not co-located
