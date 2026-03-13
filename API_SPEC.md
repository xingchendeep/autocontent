# API Specification

## 1. Document Info

| Item | Value |
|------|------|
| Project | AutoContent Pro |
| Version | v0.1 |
| Based on | PRD v0.4, TDD v0.3 |
| Date | 2026-03-13 |

---

## 2. Conventions

### Base URL
- Local: `http://localhost:3000`
- Production: `${APP_URL}`

### Content Type
- Request: `application/json`
- Response: `application/json`

### Authentication
- Anonymous access allowed for some MVP endpoints
- Logged-in endpoints rely on Supabase session cookies
- Server must derive user identity from session, not request body

### Request ID
- Every response should include `requestId`
- Recommended response header: `x-request-id`

### Timestamp
- All timestamps use ISO 8601 UTC format

---

## 3. Common Response Shapes

### Success

```json
{
  "success": true,
  "data": {},
  "requestId": "req_123456",
  "timestamp": "2026-03-13T08:00:00.000Z"
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "Request payload is invalid.",
    "details": {
      "content": "Content is required."
    }
  },
  "requestId": "req_123456",
  "timestamp": "2026-03-13T08:00:00.000Z"
}
```

### Pagination

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "hasMore": false
    }
  },
  "requestId": "req_123456",
  "timestamp": "2026-03-13T08:00:00.000Z"
}
```

---

## 4. Error Codes

| Code | HTTP | Meaning |
|------|------|------|
| `INVALID_INPUT` | 400 | Request body or query is invalid |
| `INVALID_PLATFORM` | 400 | Unsupported platform |
| `INVALID_URL` | 400 | Unsupported or malformed URL |
| `CONTENT_TOO_LONG` | 400 | Input exceeds max length |
| `UNAUTHORIZED` | 401 | Login required |
| `FORBIDDEN` | 403 | No permission |
| `PLAN_LIMIT_REACHED` | 402 | Plan or quota limit reached |
| `CONTENT_BLOCKED` | 422 | Content blocked by moderation |
| `RATE_LIMITED` | 429 | Too many requests |
| `NOT_FOUND` | 404 | Resource not found |
| `AI_PROVIDER_ERROR` | 500 | Upstream AI provider failed |
| `EXTRACTION_FAILED` | 500 | URL content extraction failed |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | Invalid webhook signature |
| `SERVICE_UNAVAILABLE` | 503 | Temporary outage |
| `INTERNAL_ERROR` | 500 | Unknown internal failure |

---

## 5. Platform Enum

Supported platform codes:

```text
douyin
xiaohongshu
bilibili
weibo
wechat
twitter
linkedin
kuaishou
zhihu
toutiao
```

---

## 6. POST /api/generate

Generate platform-specific copy from manual content or extracted content.

### Auth
- Optional in MVP
- Logged-in users may receive cloud history and plan-aware capability checks

### Rate Limit
- Anonymous: strict IP-based limit
- Logged-in: user + IP-based limit

### Request Body

```json
{
  "content": "这是视频脚本正文",
  "platforms": ["douyin", "xiaohongshu"],
  "source": "manual",
  "options": {
    "tone": "professional",
    "length": "medium"
  }
}
```

### Field Rules

| Field | Type | Required | Rules |
|------|------|------|------|
| `content` | string | yes | 1 - 100000 chars |
| `platforms` | string[] | yes | 1 - 10 items, must be supported |
| `source` | enum | no | `manual` or `extract` |
| `options.tone` | enum | no | `professional`, `casual`, `humorous` |
| `options.length` | enum | no | `short`, `medium`, `long` |

### Success Response

```json
{
  "success": true,
  "data": {
    "generationId": "2c4b9f89-1cb3-4d26-bc58-c4a50d4d3b2d",
    "results": {
      "douyin": {
        "title": "3个方法提升内容效率",
        "content": "正文内容...",
        "hashtags": ["#自媒体", "#效率工具"],
        "tokens": 322
      },
      "xiaohongshu": {
        "title": "做内容真的要学会借力",
        "content": "正文内容...",
        "hashtags": ["#内容创作", "#AI工具"],
        "tokens": 351
      }
    },
    "durationMs": 12450,
    "model": "qwen-plus",
    "partialFailure": false
  },
  "requestId": "req_generate_001",
  "timestamp": "2026-03-13T08:00:00.000Z"
}
```

### Error Cases
- Unsupported platform
- Empty content
- Content blocked
- Rate limit exceeded
- Upstream AI failure

---

## 7. POST /api/extract

Extract content from a supported video URL.

### Auth
- Optional

### Request Body

```json
{
  "url": "https://www.youtube.com/watch?v=example"
}
```

### Field Rules

| Field | Type | Required | Rules |
|------|------|------|------|
| `url` | string | yes | Must be YouTube or Bilibili URL in MVP |

### Success Response

```json
{
  "success": true,
  "data": {
    "content": "提取出的文本内容",
    "source": "subtitle",
    "platform": "youtube"
  },
  "requestId": "req_extract_001",
  "timestamp": "2026-03-13T08:00:00.000Z"
}
```

### Error Response Example

```json
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "Only YouTube and Bilibili URLs are supported in MVP."
  },
  "requestId": "req_extract_001",
  "timestamp": "2026-03-13T08:00:00.000Z"
}
```

---

## 8. GET /api/history

Get paginated generation history for the current user.

### Auth
- Required

### Query Params

| Param | Type | Required | Default | Notes |
|------|------|------|------|------|
| `page` | number | no | 1 | min 1 |
| `limit` | number | no | 20 | max 100 |
| `platform` | string | no | - | filter by platform |
| `status` | string | no | - | `success`, `failed`, `partial` |

### Success Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "2c4b9f89-1cb3-4d26-bc58-c4a50d4d3b2d",
        "inputSource": "manual",
        "platforms": ["douyin", "xiaohongshu"],
        "platformCount": 2,
        "status": "success",
        "modelName": "qwen-plus",
        "durationMs": 12450,
        "createdAt": "2026-03-13T08:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "hasMore": false
    }
  },
  "requestId": "req_history_001",
  "timestamp": "2026-03-13T08:00:00.000Z"
}
```

### Notes
- List endpoint should return summaries, not full `input_content` or full `result_json`

---

## 9. GET /api/history/:id

Get details for one generation record.

### Auth
- Required

### Path Params

| Param | Type | Required |
|------|------|------|
| `id` | uuid | yes |

### Success Response

```json
{
  "success": true,
  "data": {
    "id": "2c4b9f89-1cb3-4d26-bc58-c4a50d4d3b2d",
    "inputSource": "manual",
    "inputContent": "这是视频脚本正文",
    "extractedUrl": null,
    "platforms": ["douyin", "xiaohongshu"],
    "platformCount": 2,
    "resultJson": {
      "douyin": {
        "title": "3个方法提升内容效率",
        "content": "正文内容..."
      }
    },
    "promptVersion": "v1",
    "modelName": "qwen-plus",
    "tokensInput": 520,
    "tokensOutput": 673,
    "durationMs": 12450,
    "status": "success",
    "errorCode": null,
    "errorMessage": null,
    "createdAt": "2026-03-13T08:00:00.000Z"
  },
  "requestId": "req_history_detail_001",
  "timestamp": "2026-03-13T08:00:00.000Z"
}
```

---

## 10. GET /api/usage

Get current usage summary for the logged-in user.

### Auth
- Required

### Success Response

```json
{
  "success": true,
  "data": {
    "currentMonth": "2026-03",
    "monthlyGenerationCount": 18,
    "totalGenerationCount": 42,
    "lastGenerationAt": "2026-03-13T08:00:00.000Z",
    "plan": {
      "code": "creator",
      "displayName": "Creator",
      "monthlyGenerationLimit": null,
      "platformLimit": 10,
      "speedTier": "fast"
    }
  },
  "requestId": "req_usage_001",
  "timestamp": "2026-03-13T08:00:00.000Z"
}
```

---

## 11. POST /api/checkout

Create a checkout session for a paid plan.

### Auth
- Required

### Request Body

```json
{
  "planCode": "creator",
  "successUrl": "https://example.com/dashboard/billing?status=success",
  "cancelUrl": "https://example.com/pricing?status=cancel"
}
```

### Field Rules

| Field | Type | Required | Rules |
|------|------|------|------|
| `planCode` | string | yes | Must be active paid plan |
| `successUrl` | string | yes | Absolute URL |
| `cancelUrl` | string | yes | Absolute URL |

### Success Response

```json
{
  "success": true,
  "data": {
    "checkoutUrl": "https://checkout.lemonsqueezy.com/buy/xxx",
    "provider": "lemonsqueezy"
  },
  "requestId": "req_checkout_001",
  "timestamp": "2026-03-13T08:00:00.000Z"
}
```

### Error Cases
- Invalid plan
- Free plan selected
- Not logged in

---

## 12. POST /api/webhooks/lemon

Receive Lemon Squeezy webhook events.

### Auth
- No session auth
- Signature validation required

### Headers

| Header | Required | Notes |
|------|------|------|
| `x-signature` | yes | Verify against `LEMONSQUEEZY_WEBHOOK_SECRET` |

### Processing Rules
- Reject invalid signature
- Ensure idempotency by provider event ID
- Persist raw payload or normalized payload to `webhook_events`
- Update `subscriptions` based on event type

### Success Response

```json
{
  "success": true,
  "data": {
    "processed": true
  },
  "requestId": "req_webhook_001",
  "timestamp": "2026-03-13T08:00:00.000Z"
}
```

### Common Event Mapping

| Provider Event | Action |
|------|------|
| `order_created` | record order metadata |
| `subscription_created` | create active subscription |
| `subscription_updated` | update subscription fields |
| `subscription_cancelled` | set status and cancelled time |
| `subscription_expired` | mark expired |

---

## 13. GET /api/health

Basic health endpoint for monitoring.

### Auth
- None

### Success Response

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "autocontent-pro-api",
    "version": "v0.1"
  },
  "requestId": "req_health_001",
  "timestamp": "2026-03-13T08:00:00.000Z"
}
```

---

## 14. Validation Rules Summary

### Content Validation
- Strip leading and trailing whitespace
- Reject empty content after trim
- Max length: 100000 chars

### Platform Validation
- Deduplicate repeated platforms
- Reject unsupported platform codes
- Reject if final list is empty

### URL Validation
- MVP supports YouTube and Bilibili only
- Reject private or malformed URLs if extractor cannot handle them

---

## 15. Security Rules

- All mutating endpoints must validate JSON schema
- Never trust client-supplied user IDs
- Error responses must avoid internal stack traces
- Webhook endpoint must verify signature and use idempotency storage
- Rate limiting must be enforced before expensive AI calls

---

## 16. Suggested Implementation Order

1. `POST /api/generate`
2. `GET /api/health`
3. `POST /api/extract`
4. `GET /api/history`
5. `GET /api/history/:id`
6. `GET /api/usage`
7. `POST /api/checkout`
8. `POST /api/webhooks/lemon`

