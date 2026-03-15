# 实施计划：Risk Control and Launch Readiness（v1.0 Phase 5）

## 概述

本阶段在已有 MVP 安全基础上，为 AutoContent Pro v1.0 生产上线提供最后一层防护。实施顺序为：基础模块（限流、审计日志、内容审核）→ 路由增强 → 集成测试 → 属性测试 → E2E 测试。

对应 TASKS.md 任务：TSK-M2-030、TSK-M2-032、TSK-M2-040、TSK-M2-041、TSK-M2-042。

---

## 任务列表

- [x] 1. 实现双维度限流模块（TSK-M2-030 · P0）
  - 在 `src/lib/rate-limit/index.ts` 实现 `checkRateLimit(key, limit, windowSeconds): Promise<RateLimitResult>`
  - 使用 `@upstash/redis` pipeline 原子执行 `SET key 0 EX windowSeconds NX` + `INCR key`
  - 实现内部辅助函数 `buildRateLimitKey(scope, dimension, identifier, windowLabel): string`，key 格式为 `rl:{scope}:{dimension}:{identifier}:{windowLabel}`
  - Redis 连接失败时降级返回 `{ allowed: true, remaining: -1, resetAt: -1 }`，通过 `logger.warn` 记录，不阻塞请求
  - 导出 `RateLimitResult` 接口
  - _需求：1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 1.1 为限流模块编写属性测试 P1：计数器单调递增
    - **属性 P1：Rate Limit Counter Monotonicity**
    - 用 `fc.integer({ min: 1, max: 50 })` 生成随机 limit N，调用 `checkRateLimit` N 次，验证每次 `remaining` 递减且等于 `N - K`；第 N+1 次验证 `allowed: false`，`remaining: 0`
    - 文件：`tests/integration/risk-control-launch-readiness/properties/p1-rate-limit-monotonicity.test.ts`
    - **验证：需求 1.3, 1.4**

  - [ ]* 1.2 为限流模块编写属性测试 P2：Key 格式不变量
    - **属性 P2：Rate Limit Key Format Invariant**
    - 用 `fc.string()` 生成随机 identifier，验证 `buildRateLimitKey` 输出匹配正则 `/^rl:[a-z]+:[a-z]+:.+:1h$/`，不含非法字符或额外分隔符
    - 文件：`tests/integration/risk-control-launch-readiness/properties/p2-rate-limit-key-format.test.ts`
    - **验证：需求 1.7**

- [x] 2. 实现审计日志模块（TSK-M2-030 · P0）
  - 在 `src/lib/db/audit-logger.ts` 实现 `writeAuditLog(entry: AuditLogEntry): Promise<void>`
  - 定义 `AuditLogEntry` 接口和 `AuditAction` 联合类型（包含 10 个 action 常量）
  - 使用 Service Role Client（`SUPABASE_SERVICE_ROLE_KEY`）写入 `audit_logs` 表，绕过 RLS
  - 内部用 `try/catch` 包裹所有 Supabase 操作，捕获异常后调用 `logger.warn`，不抛出
  - 调用方使用 `void writeAuditLog(...)` 模式，确保审计失败不影响 HTTP 响应
  - _需求：4.3, 4.4, 4.5, 5.6, 6.4, 6.5_

  - [ ]* 2.1 为审计日志模块编写属性测试 P4：非阻塞保证
    - **属性 P4：Audit Log Non-Blocking**
    - 注入一个总是 reject 的 mock Supabase client，调用 `writeAuditLog`，验证函数 resolve（不 reject），且不抛出任何异常
    - 文件：`tests/integration/risk-control-launch-readiness/properties/p4-audit-log-non-blocking.test.ts`
    - **验证：需求 4.4, 5.5, 6.4**

- [x] 3. 增强内容审核模块（TSK-M2-032 · P0）
  - 在 `src/lib/moderation/keywords.ts` 将关键词列表提取为 `BLOCKED_KEYWORDS: readonly string[]` 常量（从现有内联代码迁移）
  - 重构 `src/lib/moderation/index.ts`，导出 `ModerationResult` 接口和 `checkContent(content: string): ModerationResult`
  - `checkContent` 返回 `{ blocked: true, reason: 'KEYWORD_MATCH', matchedKeywords: string[] }` 或 `{ blocked: false }`
  - `matchedKeywords` 仅用于内部日志，不序列化到任何外部输出
  - _需求：7.1, 7.2, 7.6, 7.7_

  - [ ]* 3.1 为内容审核模块编写属性测试 P5：HTTP 响应关键词保密性
    - **属性 P5：Moderation Keyword Confidentiality in HTTP Response**
    - 用 `fc.string()` 生成随机关键词，将其加入测试关键词列表，构造含该关键词的请求内容，调用 generate 路由，验证 422 响应体的 JSON 序列化字符串不包含该关键词
    - 文件：`tests/integration/risk-control-launch-readiness/properties/p5-keyword-confidentiality-http.test.ts`
    - **验证：需求 7.2, 7.3**

  - [ ]* 3.2 为内容审核模块编写属性测试 P6：审计日志关键词保密性
    - **属性 P6：Audit Log Keyword Confidentiality**
    - 同 P5，但验证 `audit_logs` 中 `CONTENT_BLOCKED` 行的 `metadata` 不含关键词字符串，只含 `keywordCount`（数字）
    - 文件：`tests/integration/risk-control-launch-readiness/properties/p6-keyword-confidentiality-audit.test.ts`
    - **验证：需求 7.5**

- [x] 4. 增强 POST /api/generate 路由（TSK-M2-030 · P0）
  - 在 Zod 验证通过后、plan capability 检查前，插入双维度限流逻辑
  - 匿名用户：IP 维度 5 req/h；免费用户：userId 维度 20 req/h + IP 维度 10 req/h；付费用户：userId 维度 100 req/h + IP 维度 30 req/h
  - 限流触发时返回 HTTP 429，error code `RATE_LIMITED`，`details.retryAfter` 为 `resetAt` Unix 时间戳
  - 替换 TSK-M1-033 中的纯 IP 限流逻辑
  - 在内容被拦截时调用 `void writeAuditLog({ action: 'CONTENT_BLOCKED', ... })`，`metadata` 含 `requestId`、`reason`、`keywordCount`，不含 `matchedKeywords`
  - 在 AI 生成失败（500）时调用 `void writeAuditLog({ action: 'GENERATION_FAILED', ... })`，`metadata` 含 `requestId`、`errorCode`、`platformCount`、`durationMs`
  - _需求：2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 6.1, 7.3, 7.4, 7.5_

  - [ ]* 4.1 为 generate 路由编写属性测试 P3：限流触发返回 429 含 retryAfter
    - **属性 P3：Rate-Limited Requests Return 429 with retryAfter**
    - 用 `fc.record(...)` 生成随机有效请求体，先耗尽匿名 IP 限额（5 次），再发第 6 次请求，验证响应状态为 429，error code 为 `RATE_LIMITED`，`details.retryAfter` 为正整数 Unix 时间戳
    - 文件：`tests/integration/risk-control-launch-readiness/properties/p3-rate-limited-429.test.ts`
    - **验证：需求 2.4, 2.6**

- [x] 5. 增强 POST /api/extract 路由（TSK-M2-030 · P1）
  - 在 `src/app/api/extract/route.ts` 中插入限流逻辑（scope: `'extract'`）
  - 匿名用户：IP 维度 3 req/h；免费用户：userId 维度 10 req/h；付费用户：userId 维度 30 req/h
  - 限流触发时返回 HTTP 429，error code `RATE_LIMITED`
  - _需求：3.1, 3.2, 3.3, 3.4_

- [x] 6. 增强 auth callback 路由（TSK-M2-032 · P0）
  - 在 `src/app/auth/callback/route.ts` 成功回调后调用 `void writeAuditLog({ action: 'USER_SIGN_IN', userId, ipAddress, userAgent })`
  - 在登录失败路径（server action 或 callback 错误分支）调用 `void writeAuditLog({ action: 'USER_SIGN_IN_FAILED', ipAddress, userAgent, userId: null, metadata: { reason } })`
  - _需求：4.1, 4.2, 4.3, 4.4_

- [x] 7. 增强 POST /api/webhooks/lemon 路由（TSK-M2-032 · P0）
  - 签名验证失败后调用 `void writeAuditLog({ action: 'WEBHOOK_SIGNATURE_INVALID', userId: null, ipAddress, metadata: { provider: 'lemonsqueezy' } })`
  - 成功处理 `subscription_created` 后调用 `void writeAuditLog({ action: 'SUBSCRIPTION_CREATED', userId, resourceType: 'subscription', resourceId, metadata: { planCode, provider } })`
  - 成功处理 `subscription_cancelled` 后调用 `void writeAuditLog({ action: 'SUBSCRIPTION_CANCELLED', userId, resourceType: 'subscription', resourceId })`
  - 成功处理 `subscription_updated`（状态变更）后调用 `void writeAuditLog({ action: 'SUBSCRIPTION_UPDATED', userId, metadata: { previousStatus, newStatus } })`
  - 成功处理 `order_created` 后调用 `void writeAuditLog({ action: 'ORDER_CREATED', userId, resourceType: 'order', resourceId })`
  - 审计日志写入失败不影响 webhook 返回 HTTP 200
  - _需求：5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.2_

- [x] 8. 增强 POST /api/checkout 路由（TSK-M2-032 · P1）
  - 在 Lemon Squeezy SDK 失败返回 HTTP 503 时，调用 `void writeAuditLog({ action: 'CHECKOUT_FAILED', userId, metadata: { planCode, requestId } })`
  - _需求：6.3, 6.4, 6.5_

- [x] 9. 检查点 — 基础模块与路由增强完成
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 10. 创建集成测试基础设施（TSK-M2-040 · P0）
  - 创建 `tests/integration/risk-control-launch-readiness/vitest.config.ts`，继承现有模式，注入 `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`、`NEXT_PUBLIC_APP_URL` 环境变量
  - 创建 `tests/integration/risk-control-launch-readiness/helpers.ts`，实现：
    - `resetRateLimitKeys(scope: string)` — 通过 Upstash REST API 删除 `rl:{scope}:*` 模式的 key
    - `setUserPlan(userId, planCode)` — 直接写 subscriptions 表设置测试用户套餐
    - 复用 `payments-monetization/helpers.ts` 中的 `createTestUser`、`deleteTestUser`、`signWebhookPayload`
  - _需求：8.7, 10.1_

- [x] 11. 编写 generate 路由集成测试（TSK-M2-040 · P0）
  - 创建 `tests/integration/risk-control-launch-readiness/generate.test.ts`
  - 测试场景：
    1. 免费用户有效请求 → HTTP 200，含 `generationId` 和 `results`
    2. 匿名 IP 超限（连续 6 次）→ HTTP 429，`RATE_LIMITED`
    3. 内容含屏蔽词 → HTTP 422，`CONTENT_BLOCKED`
    4. 免费用户超平台数 → HTTP 402，`PLAN_LIMIT_REACHED`
    5. 无效平台代码 → HTTP 400，`INVALID_PLATFORM`
  - 每个测试前通过 `helpers.ts` 重置 Redis 限流 key
  - _需求：8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 12. 编写 history 和 usage 路由集成测试（TSK-M2-040 · P0）
  - 创建 `tests/integration/risk-control-launch-readiness/history.test.ts`
  - 测试场景：
    1. 未认证请求 `GET /api/history` → HTTP 401，`UNAUTHORIZED`
    2. 用户 A 只能看到自己的记录（用户 B 的记录不出现）
    3. 响应 items 不含 `input_content` 或 `result_json` 字段
    4. `GET /api/usage` 在写入一条生成记录后返回正确 `monthlyGenerationCount`
    5. 未认证请求 `GET /api/usage` → HTTP 401，`UNAUTHORIZED`
  - _需求：9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 13. 编写 webhook 路由集成测试（TSK-M2-040 · P0）
  - 创建 `tests/integration/risk-control-launch-readiness/webhook.test.ts`
  - 测试场景：
    1. 无效签名 → HTTP 401，`WEBHOOK_SIGNATURE_INVALID`
    2. 有效 `subscription_created` → subscriptions 表有 `status: active` 行
    3. 同一 event_id 发送两次 → `webhook_events` 只有一行，第二次返回 `{ processed: true }`
    4. 有效 `subscription_cancelled` → status 变为 `cancelled`，`cancelled_at` 有值
    5. 成功处理 `subscription_created` 后 → `audit_logs` 有 `SUBSCRIPTION_CREATED` 行
  - _需求：10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 14. 检查点 — 集成测试完成
  - 确保所有集成测试通过，如有疑问请向用户确认。

- [x] 15. 配置 Playwright 并创建 E2E 测试基础设施（TSK-M2-041 · P0）
  - 在项目根目录创建 `playwright.config.ts`：
    - `baseURL`: `process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'`
    - `testDir`: `'./tests/e2e'`
    - `use.trace`: `'on-first-retry'`
    - 配置 `storageState` 保存认证状态，避免每个测试重复登录
  - 在 `package.json` 中添加 `"test:e2e": "playwright test"` 脚本
  - _需求：11.5_

- [x] 16. 编写 E2E 登录路径测试（TSK-M2-041 · P0）
  - 创建 `tests/e2e/auth.spec.ts`
  - 测试场景：
    1. 导航到 `/login` → 输入有效凭据 → 重定向到 `/dashboard`
    2. 输入无效凭据 → 停留在 `/login`，显示错误消息，不重定向
    3. 登录成功后 dashboard 显示来自 `GET /api/usage` 的套餐名称
  - _需求：11.1, 11.2, 11.3, 11.4_

- [x] 17. 编写 E2E 生成路径测试（TSK-M2-041 · P0）
  - 创建 `tests/e2e/generate.spec.ts`
  - 测试场景：
    1. 匿名用户粘贴内容 → 选择至少一个平台 → 点击生成 → 看到非空结果卡片
    2. 点击复制按钮 → 触发剪贴板写入或显示成功指示
    3. 空内容提交 → 显示验证错误，不调用 API
    4. API 返回 `RATE_LIMITED` → UI 显示用户友好错误消息
  - _需求：12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 18. 编写 E2E 历史和支付路径测试（TSK-M2-042 · P0）
  - 创建 `tests/e2e/history.spec.ts`：
    1. 认证用户完成生成 → 在 `/dashboard/history` 看到该记录
    2. 未认证用户访问 `/dashboard/history` → 重定向到 `/login`
  - 创建 `tests/e2e/payment.spec.ts`：
    1. 认证用户在 `/pricing` 点击升级 CTA → 重定向到 Lemon Squeezy checkout URL（验证重定向发生，不验证完整支付流程）
    2. 未认证用户点击升级 CTA → 重定向到 `/login`
  - _需求：13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [x] 19. 最终检查点 — 确保所有测试通过
  - 确保所有集成测试和 E2E 测试通过，如有疑问请向用户确认。

---

## 备注

- 标有 `*` 的子任务为可选项，可在快速 MVP 迭代中跳过
- 每个任务均引用具体需求条款，确保可追溯性
- 属性测试（P1–P6）使用 `fast-check`，每个属性最少运行 100 次迭代
- E2E 测试使用 Playwright，需在 staging 环境运行
- 限流模块降级策略：Redis 不可用时放行请求，不阻塞用户
- 审计日志始终使用 `void writeAuditLog(...)` 模式，确保非阻塞
