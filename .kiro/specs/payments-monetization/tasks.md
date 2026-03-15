# 实现计划：支付与商业化（Phase 4）

## 概述

按依赖顺序实现 Lemon Squeezy 支付集成，包括类型扩展、错误码扩展、SDK 适配层、Checkout API、Webhook 处理器、套餐能力执行、定价页和订阅管理页。

## 任务列表

- [x] 1. 扩展类型定义与错误码
  - [x] 1.1 在 `src/types/index.ts` 中新增 `CheckoutResponseData`、`SubscriptionStatus`、`PricingPlan` 类型
    - 新增 `CheckoutResponseData`：`{ checkoutUrl: string; provider: 'lemonsqueezy' }`
    - 新增 `SubscriptionStatus`：联合类型 `'active' | 'cancelled' | 'expired' | 'past_due' | 'trialing' | 'paused'`
    - 新增 `PricingPlan`：`{ code, displayName, priceMonthly, monthlyGenerationLimit, platformLimit, speedTier }`
    - _需求：2.1、5.2、1.1_

  - [x] 1.2 在 `src/lib/errors/index.ts` 中新增 `WEBHOOK_SIGNATURE_INVALID` 错误码
    - 在 `ERROR_CODES` 中添加 `WEBHOOK_SIGNATURE_INVALID: 'WEBHOOK_SIGNATURE_INVALID'`
    - 在 `ERROR_STATUS` 中映射 `WEBHOOK_SIGNATURE_INVALID: 401`
    - _需求：3.2_

- [x] 2. 实现 Lemon Squeezy SDK 适配层
  - [x] 2.1 创建 `src/lib/billing/lemon-squeezy.ts`，实现 `createCheckoutSession` 和 `verifyWebhookSignature`
    - 在模块顶层以 `LEMONSQUEEZY_API_KEY` 初始化 SDK（仅服务端）
    - 实现 `createCheckoutSession(variantId, userId, successUrl, cancelUrl): Promise<string>`，调用 Lemon Squeezy API 返回 `checkoutUrl`
    - 实现 `verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean`，使用 Node.js `crypto` 计算 HMAC-SHA256 并进行时序安全比较
    - 不导出 `LEMONSQUEEZY_API_KEY`，不在任何客户端组件中引用此模块
    - _需求：7.1、7.2、7.3、7.4_

  - [x]* 2.2 为 `verifyWebhookSignature` 编写单元测试（`tests/unit/billing/lemon-squeezy.test.ts`）
    - 测试已知合法签名返回 `true`
    - 测试空签名返回 `false`
    - 测试载荷被篡改后返回 `false`
    - _需求：3.1、3.2_

- [x] 3. 实现 Checkout API
  - [x] 3.1 创建 `src/app/api/checkout/route.ts`，实现 `POST /api/checkout`
    - 使用 Zod 校验请求体：`planCode`（`"creator" | "studio" | "enterprise"`）、`successUrl`、`cancelUrl`
    - 无有效 session 时返回 401 `UNAUTHORIZED`
    - `planCode` 无效或为 `"free"` 时返回 400 `INVALID_INPUT`
    - 通过环境变量 `LEMON_VARIANT_CREATOR/STUDIO/ENTERPRISE` 映射 Plan_Code → Variant_ID
    - 调用 `createCheckoutSession`，成功返回 200 `ApiSuccess<CheckoutResponseData>`
    - SDK 调用失败时返回 503 `SERVICE_UNAVAILABLE`
    - 所有响应包含 `requestId` 和 `timestamp`
    - _需求：2.1、2.2、2.3、2.4、2.5、2.6、2.7、2.8_

  - [ ]* 3.2 为 Checkout API 编写单元测试（`tests/unit/billing/checkout.test.ts`）
    - 测试 `planCode: "free"` 返回 400
    - 测试无 session 返回 401
    - 测试 SDK 失败返回 503
    - _需求：2.2、2.3、2.4、2.7_

- [x] 4. 实现 Webhook 处理器
  - [x] 4.1 创建 `src/app/api/webhooks/lemon/route.ts`，实现 `POST /api/webhooks/lemon`
    - 以 `req.arrayBuffer()` 读取原始字节流，转为 `Buffer`
    - 调用 `verifyWebhookSignature`，签名无效时返回 401 `WEBHOOK_SIGNATURE_INVALID`，不记录事件
    - 签名验证通过后才执行 `JSON.parse`
    - 尝试插入 `webhook_events(provider, event_id)`；捕获唯一约束冲突，返回 200 `{ processed: true }`（幂等）
    - 根据 `event_type` 执行订阅状态变更（见设计文档事件映射表）
    - `subscription_updated` 事件不得将状态从 `expired` 变更为 `active`
    - 对已处于 `cancelled`/`expired` 终态的订阅重复发送同类终态事件，作为无操作处理
    - DB 写入失败时返回 500 `INTERNAL_ERROR`
    - 成功时返回 200 `{ processed: true }`
    - 不使用 session 认证，签名验证是唯一认证机制
    - _需求：3.1、3.2、3.3、3.4、3.5、3.6、3.7、3.8、3.9、3.10、3.11、3.12、4.1、4.2、4.3、4.4_

  - [ ]* 4.2 为 Webhook 处理器编写单元测试（`tests/unit/billing/webhook.test.ts`）
    - 测试 `order_created` 事件不修改 `subscriptions` 表
    - 测试 DB 写入失败返回 500
    - 测试无 session 的合法签名请求正常处理
    - _需求：3.8、3.11、3.12_

- [x] 5. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 6. 修改 Generate Route 以执行套餐能力限制
  - [x] 6.1 修改 `src/app/api/generate/route.ts`，在 Zod 校验通过后、调用 AI 服务前插入套餐能力检查
    - 导入 `getPlanCapability` 和 `PlanCapability` 类型
    - 仅对已登录用户（`userId !== null`）执行能力检查
    - `getPlanCapability` 抛出异常时返回 503 `SERVICE_UNAVAILABLE`
    - `platforms.length > capability.maxPlatforms`（非 null）时返回 402 `PLAN_LIMIT_REACHED`
    - 从 `usage_stats` 读取当月生成次数（复用已有 `getMonthlyGenerationCount` 或等效查询），`count >= monthlyGenerationLimit`（非 null）时返回 402 `PLAN_LIMIT_REACHED`
    - 限制为 `null` 时不执行对应维度的检查
    - 匿名用户跳过 `getPlanCapability`，沿用 Phase 1 的 IP 限流
    - _需求：6.1、6.2、6.3、6.4、6.5、6.6、6.7_

  - [ ]* 6.2 为套餐能力执行编写单元测试（`tests/unit/billing/plan-capability-enforcement.test.ts`）
    - 测试匿名用户不触发 `getPlanCapability` 调用
    - 测试 `maxPlatforms: null` 时不返回 402
    - 测试 `monthlyGenerationLimit: null` 时不返回 402
    - _需求：6.4、6.5、6.6_

- [x] 7. 实现定价页
  - [x] 7.1 创建服务端组件 `src/app/(marketing)/pricing/page.tsx`，从 `plans` 表读取套餐数据
    - 使用 `createServiceRoleClient` 查询 `plans` 表，映射为 `PricingPlan[]`
    - 通过 `getSession` 获取当前用户，传递 `currentPlanCode` 给客户端子组件
    - 渲染 `PricingCard` 客户端子组件列表
    - _需求：1.1、1.2、1.7_

  - [x] 7.2 创建客户端组件 `src/components/pricing/PricingCard.tsx`，处理升级 CTA 交互
    - 已登录用户点击升级：调用 `POST /api/checkout`，获得 `checkoutUrl` 后 `window.location.href` 跳转
    - 未登录用户点击升级：`router.push('/login')`
    - Checkout API 返回错误时展示内联错误提示，不跳转
    - 当前套餐高亮显示
    - _需求：1.3、1.4、1.5、1.6、1.7_

- [x] 8. 实现订阅管理页
  - [x] 8.1 创建服务端组件 `src/app/dashboard/subscription/page.tsx`，展示当前套餐信息
    - 通过 `GET /api/usage` 获取当前套餐和订阅状态（服务端 fetch 或直接调用 db 层）
    - 渲染 `SubscriptionPanel` 客户端子组件，传入套餐数据
    - 未登录时 middleware 已重定向至 `/login`，无需额外处理
    - _需求：5.1、5.2、5.8_

  - [x] 8.2 创建客户端组件 `src/components/dashboard/SubscriptionPanel.tsx`，根据订阅状态条件渲染
    - `active`/`trialing`：展示升降级选项（调用 Checkout API）+ 取消入口
    - `cancelled`/`expired`：展示重新订阅 CTA（链接到 `/pricing`）
    - `past_due`/`paused`：展示提示信息
    - Checkout API 返回错误时展示内联错误提示，不跳转
    - 订阅状态来源于数据库（通过 `GET /api/usage`），不读取 URL 查询参数
    - _需求：5.3、5.4、5.5、5.6、5.7、5.8_

- [x] 9. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

- [-] 10. 属性测试
  - [x] 10.1 配置集成测试环境（`tests/integration/payments-monetization/vitest.config.ts` 和 `helpers.ts`）
    - 参考 `tests/integration/cloud-data-plan-foundation/helpers.ts` 的模式
    - 配置 Supabase 测试客户端和测试数据清理工具
    - _需求：3.3、3.1_

  - [ ]* 10.2 编写属性测试 P1：Webhook 幂等性（`tests/integration/payments-monetization/properties/p1-webhook-idempotency.test.ts`）
    - **属性 1：Webhook 幂等性**
    - **验证需求：3.3**
    - 使用 fast-check 生成随机合法 webhook 载荷，发送两次，验证 `webhook_events` 仅一行，第二次响应为 200 `{ processed: true }`
    - 最少运行 100 次迭代
    - 注释：`// Feature: payments-monetization, Property 1: Webhook 幂等性`

  - [ ]* 10.3 编写属性测试 P2：签名验证可靠性（`tests/integration/payments-monetization/properties/p2-signature-verification.test.ts`）
    - **属性 2：签名验证可靠性**
    - **验证需求：3.1、3.2**
    - 使用 fast-check 生成随机 `(payload, secret)` 对，对任意字节位置的修改，验证 `verifyWebhookSignature` 返回 `false`
    - 最少运行 100 次迭代
    - 注释：`// Feature: payments-monetization, Property 2: 签名验证可靠性`

  - [ ]* 10.4 编写属性测试 P3：订阅状态机合法性（`tests/integration/payments-monetization/properties/p3-subscription-state-machine.test.ts`）
    - **属性 3：订阅状态机合法性**
    - **验证需求：4.1、4.2、4.3、4.4**
    - 使用 fast-check 生成随机事件类型和订阅状态，验证写入的 `status` 始终在允许集合内，验证 `expired → active` 转换被阻止
    - 最少运行 100 次迭代
    - 注释：`// Feature: payments-monetization, Property 3: 订阅状态机合法性`

  - [ ]* 10.5 编写属性测试 P4：套餐能力执行完整性（`tests/integration/payments-monetization/properties/p4-plan-capability-enforcement.test.ts`）
    - **属性 4：套餐能力执行完整性**
    - **验证需求：6.2、6.3、6.4、6.5**
    - 使用 fast-check 生成随机用户套餐限制和请求参数，验证超限时返回 402，`null` 限制时不返回 402
    - 最少运行 100 次迭代
    - 注释：`// Feature: payments-monetization, Property 4: 套餐能力执行完整性`

  - [ ]* 10.6 编写属性测试 P5：Checkout 认证门控（`tests/integration/payments-monetization/properties/p5-checkout-auth-gate.test.ts`）
    - **属性 5：Checkout 认证门控**
    - **验证需求：2.1、2.2、2.3、2.4**
    - 使用 fast-check 生成随机 `planCode` 和 session 状态，验证无 session 返回 401，无效 planCode 返回 400，合法请求返回含 `checkoutUrl` 的 200
    - 最少运行 100 次迭代
    - 注释：`// Feature: payments-monetization, Property 5: Checkout 认证门控`

  - [ ]* 10.7 编写属性测试 P6：API 响应信封完整性（`tests/integration/payments-monetization/properties/p6-api-response-envelope.test.ts`）
    - **属性 6：API 响应信封完整性**
    - **验证需求：2.8**
    - 使用 fast-check 对所有 Checkout API 请求（成功或失败），验证响应体包含非空 `requestId` 和合法 ISO 8601 `timestamp`
    - 最少运行 100 次迭代
    - 注释：`// Feature: payments-monetization, Property 6: API 响应信封完整性`

- [x] 11. 最终检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

## 备注

- 标有 `*` 的任务为可选项，可在 MVP 阶段跳过
- 每个任务均引用具体需求条款，保证可追溯性
- Webhook 处理器必须以 `req.arrayBuffer()` 读取原始字节流，在 `JSON.parse` 之前验证签名
- 幂等性通过 `webhook_events(provider, event_id)` 唯一约束实现，捕获唯一约束冲突即视为重复事件
- `LEMONSQUEEZY_API_KEY` 仅在 `src/lib/billing/lemon-squeezy.ts` 服务端初始化，绝不暴露给客户端
- 套餐能力执行仅对已登录用户生效，匿名用户沿用 Phase 1 的 IP 限流
- 定价页套餐数据从 `plans` 表读取（服务端组件），不硬编码
- 属性测试使用 fast-check，最少 100 次迭代
