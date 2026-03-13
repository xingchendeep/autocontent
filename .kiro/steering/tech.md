# Tech Stack

## Framework & Runtime
- **Next.js 16** with App Router (TypeScript)
- **React 19**
- **Tailwind CSS v4**

## Language & Tooling
- TypeScript with `strict: true`
- ESLint (eslint-config-next)
- Path alias: `@/` maps to `src/`

## Planned Integrations (by milestone)
- **AI**: DashScope / Tongyi Qianwen (primary), with adapter layer for multi-model fallback
- **Auth & DB**: Supabase (Auth + Postgres + RLS)
- **Payments**: Lemon Squeezy
- **Rate limiting**: Upstash Redis
- **Email**: Resend
- **Deployment**: Vercel
- **Analytics**: Vercel Analytics + PostHog

## Common Commands

```bash
# Development
npm run dev

# Build
npm run build

# Start production
npm run start

# Lint
npm run lint
```

## Environment Variables
Key variables needed (see TDD for full list):
```
DASHSCOPE_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_WEBHOOK_SECRET=
```

## Code Conventions
- All inputs validated with Zod
- API responses follow unified `ApiSuccess<T>` / `ApiError` shape with `requestId` and `timestamp`
- Error codes are `UPPER_SNAKE_CASE`
- Components: `PascalCase`, hooks: `useXxx`, utils: `camelCase`, constants: `UPPER_SNAKE_CASE`
- Never expose API keys client-side — server-side only
- All mutating API routes must validate request body schema
