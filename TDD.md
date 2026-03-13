# 技术设计文档（TDD）

## 1. 文档信息

| 项目 | 内容 |
|------|------|
| 项目名称 | AutoContent Pro |
| 文档版本 | v0.3（修订版） |
| 关联产品文档 | PRD v0.4 |
| 修订日期 | 2026-03-13 |
| 文档状态 | 可用于开发拆解与实施 |

---

## 2. 文档目标

本文档用于回答以下问题：
- 系统如何分层设计，职责如何划分
- MVP 与后续版本的技术边界是什么
- 数据如何存储、访问、限流与审计
- API 如何定义，错误如何处理
- 开发、测试、部署和监控如何落地

本文档不追求覆盖所有实现细节，而是提供一套足以指导工程落地的技术方案。

---

## 3. 设计原则

- 先保证 MVP 可交付，再逐步扩展复杂能力
- 优先保证生成成功率、响应时间和可观测性
- 模板逻辑、平台规则、模型调用要解耦
- 用户数据、计费数据、生成记录要可追踪
- 所有高成本操作必须具备限流、超时和降级策略

---

## 4. 系统范围

### 4.1 MVP 范围
- 手动输入内容
- 选择目标平台
- 调用 AI 生成平台文案
- 展示与复制结果
- 本地历史记录
- 可选的视频链接内容提取（YouTube / B 站优先）

### 4.2 v1.0 范围
- 用户登录
- 云端历史记录
- 使用统计
- 套餐与订阅支付
- 基础风控与审核

### 4.3 v2.0 范围
- 批量任务
- 自定义模板
- 团队协作
- API 开放
- 浏览器插件

---

## 5. 总体架构

### 5.1 架构概览

```text
Client (Web)
  -> Next.js App
    -> API Route / Server Actions
      -> Application Services
        -> AI Provider Adapter
        -> Extractor Adapter
        -> Supabase / Postgres
        -> Redis / KV (rate limit / cache)
        -> Lemon Squeezy
        -> Analytics / Logging
```

### 5.2 分层设计

#### 表现层
- Next.js App Router 页面
- React 组件与表单交互
- 客户端状态与请求状态管理

#### 接口层
- `app/api/*` 路由
- 参数校验
- 认证、限流、错误返回、请求追踪

#### 应用层
- 生成服务
- 内容提取服务
- 套餐与权限服务
- 计费与 webhook 处理服务

#### 基础设施层
- AI 模型适配器
- 数据库访问
- 缓存与限流
- 日志、埋点、监控

---

## 6. 架构决策（ADR）

| 决策点 | 选择 | 理由 | 备选方案 |
|------|------|------|------|
| Web 框架 | Next.js 14 | 全栈能力强，适合快速交付 | Remix, Nuxt |
| UI 技术 | React + Tailwind CSS | 迭代快，组件生态成熟 | Vue + UnoCSS |
| 数据库 | Supabase Postgres | 认证、数据库、RLS 一体化 | Railway + Postgres |
| 认证 | Supabase Auth | 降低登录与会话维护成本 | Clerk, Auth.js |
| AI Provider | DashScope / 通义 | 中文场景友好，成本可控 | OpenAI, Anthropic |
| 限流缓存 | Upstash Redis / Vercel KV | 简单可落地 | 自建 Redis |
| 支付 | Lemon Squeezy | 订阅与税务处理完整 | Stripe |
| 部署 | Vercel | 与 Next.js 集成最佳 | Netlify, Cloudflare Pages |

### 6.1 关键架构判断
- MVP 不引入复杂消息队列，避免过早设计
- 模型调用通过统一适配层封装，防止供应商绑定
- 支付与订阅状态以 webhook 为准，前端回跳仅作提示
- 用户权限不硬编码在前端，由服务端套餐规则统一判断

---

## 7. 目录结构建议

```text
app/
  (marketing)/
  dashboard/
  api/
    generate/
    extract/
    history/
    usage/
    checkout/
    webhooks/
components/
  forms/
  generate/
  layout/
lib/
  ai/
  auth/
  db/
  extract/
  billing/
  analytics/
  rate-limit/
  moderation/
  logger/
  errors/
types/
tests/
  unit/
  integration/
  e2e/
supabase/
  migrations/
```

### 7.1 目录原则
- 页面与业务逻辑分离
- 第三方集成统一放在 `lib/`
- 类型定义收敛到 `types/`
- 测试按层次拆分，避免混杂

---

## 8. 核心业务流程

### 8.1 文案生成流程

```text
用户提交内容
-> 参数校验
-> 内容审核
-> 身份/套餐校验
-> 限流检查
-> 读取平台模板
-> 并发调用 AI 生成
-> 汇总结果
-> 保存记录
-> 返回响应
-> 上报埋点
```

### 8.2 链接提取流程

```text
用户提交 URL
-> 校验平台与格式
-> 调用提取器
-> 优先读取字幕
-> 无字幕则读取描述
-> 清洗文本
-> 返回内容
```

### 8.3 订阅流程

```text
用户选择套餐
-> 创建 checkout
-> 支付成功后回跳
-> Lemon webhook 回调
-> 更新 subscriptions
-> 更新用户套餐能力
```

---

## 9. 数据模型设计

## 9.1 实体列表

- `users`
- `plans`
- `subscriptions`
- `generations`
- `usage_stats`
- `audit_logs`

## 9.2 表设计

### users
使用 Supabase Auth 主表，业务补充字段建议放在 profile 表中。

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(100),
  avatar_url TEXT,
  default_tone VARCHAR(30),
  default_language VARCHAR(20) DEFAULT 'zh-CN',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### plans

```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  monthly_generation_limit INTEGER,
  platform_limit INTEGER,
  speed_tier VARCHAR(20) NOT NULL DEFAULT 'standard',
  has_history BOOLEAN NOT NULL DEFAULT true,
  has_api_access BOOLEAN NOT NULL DEFAULT false,
  has_team_access BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### subscriptions

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  provider VARCHAR(30) NOT NULL DEFAULT 'lemonsqueezy',
  provider_order_id VARCHAR(255),
  provider_subscription_id VARCHAR(255),
  status VARCHAR(30) NOT NULL,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancelled_at TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

### generations

```sql
CREATE TABLE generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  input_source VARCHAR(30) NOT NULL DEFAULT 'manual',
  input_content TEXT NOT NULL,
  extracted_url TEXT,
  platforms TEXT[] NOT NULL,
  platform_count INTEGER NOT NULL,
  result_json JSONB NOT NULL,
  prompt_version VARCHAR(50),
  model_name VARCHAR(100),
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'success',
  error_code VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_generations_user_id ON generations(user_id);
CREATE INDEX idx_generations_created_at ON generations(created_at DESC);
CREATE INDEX idx_generations_status ON generations(status);
```

### usage_stats

```sql
CREATE TABLE usage_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_month CHAR(7) NOT NULL,
  monthly_generation_count INTEGER NOT NULL DEFAULT 0,
  total_generation_count INTEGER NOT NULL DEFAULT 0,
  last_generation_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### audit_logs

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

## 9.3 数据设计说明

- `generations.result_json` 保存多平台输出，避免过早拆分子表
- 若后续需要单平台分析，可引入 `generation_items`
- `usage_stats` 为读优化表，不作为唯一事实来源
- 订阅状态变更以 `subscriptions` 最新有效记录为准

---

## 10. 权限与 RLS

### 10.1 RLS 策略原则
- 用户只能读写自己的数据
- 支付 webhook、后台任务使用 service role
- 审计日志不允许普通用户修改

### 10.2 示例策略

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY profiles_update_own
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY generations_select_own
  ON generations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY generations_insert_own
  ON generations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY subscriptions_select_own
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY usage_stats_select_own
  ON usage_stats FOR SELECT
  USING (auth.uid() = user_id);
```

---

## 11. API 设计

## 11.1 API 列表

| 路径 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/generate` | POST | 可选 | 生成平台文案 |
| `/api/extract` | POST | 可选 | 提取视频内容 |
| `/api/history` | GET | 必需 | 获取历史记录 |
| `/api/history/:id` | GET | 必需 | 获取单条记录 |
| `/api/usage` | GET | 必需 | 获取使用统计 |
| `/api/checkout` | POST | 必需 | 创建支付会话 |
| `/api/webhooks/lemon` | POST | 否 | 处理支付 webhook |
| `/api/health` | GET | 否 | 健康检查 |

## 11.2 统一响应格式

```ts
type ApiSuccess<T> = {
  success: true
  data: T
  requestId: string
  timestamp: string
}

type ApiError = {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  requestId: string
  timestamp: string
}
```

## 11.3 POST /api/generate

### 请求

```ts
type GenerateRequest = {
  content: string
  platforms: string[]
  source?: 'manual' | 'extract'
  options?: {
    tone?: 'professional' | 'casual' | 'humorous'
    length?: 'short' | 'medium' | 'long'
  }
}
```

### 返回

```ts
type GenerateResponse = {
  generationId?: string
  results: Record<string, {
    title?: string
    content: string
    hashtags?: string[]
    tokens?: number
  }>
  durationMs: number
  model: string
  partialFailure?: boolean
}
```

### 错误码

| HTTP | code | 场景 |
|------|------|------|
| 400 | `INVALID_INPUT` | 输入为空、超长、参数错误 |
| 400 | `INVALID_PLATFORM` | 平台不支持 |
| 401 | `UNAUTHORIZED` | 需要登录但未登录 |
| 402 | `PLAN_LIMIT_REACHED` | 套餐权限不足 |
| 429 | `RATE_LIMITED` | 触发限流 |
| 422 | `CONTENT_BLOCKED` | 内容审核未通过 |
| 500 | `AI_PROVIDER_ERROR` | 模型调用失败 |
| 503 | `SERVICE_UNAVAILABLE` | 服务暂时不可用 |

## 11.4 POST /api/extract

### 请求

```ts
type ExtractRequest = {
  url: string
}
```

### 返回

```ts
type ExtractResponse = {
  content: string
  source: 'subtitle' | 'description'
  platform: 'youtube' | 'bilibili'
}
```

## 11.5 GET /api/history

### 查询参数
- `page`
- `limit`
- `platform`
- `status`

### 返回重点
- 列表默认按 `created_at DESC`
- 只返回摘要，不返回全部长文本

---

## 12. 模块设计

## 12.1 AI 模块

### 职责
- 管理模型调用
- 构建统一 prompt
- 根据平台模板生成内容
- 处理重试、超时、fallback

### 接口建议

```ts
type GeneratePlatformInput = {
  content: string
  platform: string
  tone?: string
  length?: string
}

type GeneratePlatformOutput = {
  content: string
  tokensInput: number
  tokensOutput: number
  model: string
}

interface AIProvider {
  generate(input: GeneratePlatformInput): Promise<GeneratePlatformOutput>
}
```

### 设计说明
- 每个平台模板配置化，放在 `lib/ai/templates.ts`
- 模型调用统一设置超时，例如 20 秒
- 单个平台失败不应导致全量失败，应支持部分成功返回

## 12.2 内容提取模块

### 职责
- 识别 URL 所属平台
- 抽取字幕或描述
- 做基础清洗和长度截断

### 风险控制
- 第三方工具执行必须加超时
- 临时文件目录必须在 `finally` 中清理
- 不记录用户敏感视频原始下载内容

## 12.3 套餐权限模块

### 职责
- 根据登录状态与套餐判断可用平台数、速度、历史记录权限
- 统一输出权限对象，供接口层调用

```ts
type PlanCapability = {
  maxPlatforms: number
  monthlyGenerationLimit: number | null
  canUseHistory: boolean
  canUseApi: boolean
  speedTier: 'standard' | 'fast' | 'priority'
}
```

## 12.4 支付模块

### 职责
- 创建 checkout
- 验签 webhook
- 映射第三方订阅状态到内部状态

### 核心要求
- webhook 验签必须真实实现，不能留空
- 所有支付回调必须幂等
- 订单与订阅号必须记录到数据库

## 12.5 审核与风控模块

### 职责
- 敏感词过滤
- 简单频控
- 基础黑名单能力

### 建议
- MVP 用规则过滤即可
- 后续可以增加模型审核或人工复核入口

---

## 13. 前端设计约束

## 13.1 页面结构

- `/`：输入、平台选择、生成结果
- `/pricing`：套餐与购买入口
- `/dashboard`：历史记录、使用情况、订阅管理

## 13.2 核心组件

- `ContentInput`
- `PlatformSelector`
- `GenerateButton`
- `ResultCard`
- `HistoryList`
- `UpgradeBanner`

## 13.3 前端交互要求

- 生成中有明确 loading 状态
- 部分失败时以卡片级错误展示
- 复制成功要有 toast 反馈
- 表单校验在提交前就执行

## 13.4 状态管理建议

- MVP 使用 React state 即可
- 登录与用户信息可通过 server component + client hydration 混合处理
- 不建议过早引入全局状态库

---

## 14. 安全设计

### 14.1 基础要求
- 所有密钥仅保存在服务端环境变量
- 所有输入使用 Zod 校验
- 错误响应不暴露内部堆栈
- 数据库访问使用参数化查询或官方 client

### 14.2 认证
- v1.0 以后统一用 Supabase Auth
- 服务端读取会话，不信任客户端传入用户 ID

### 14.3 限流
- 维度：IP + 用户 ID
- 匿名用户和登录用户分开策略
- 高成本接口必须严格限流：`/api/generate`, `/api/extract`

### 14.4 审计
- 登录、支付、订阅变更、关键生成失败要写入审计日志

### 14.5 Webhook 安全
- 验签
- 幂等键
- 重复请求去重

---

## 15. 性能设计

### 15.1 性能目标
- 首屏加载 <= 3 秒
- P95 生成耗时 <= 30 秒
- 接口错误率 < 1%

### 15.2 优化策略

- 并发生成多个平台，限制最大并发数
- 平台模板与常量静态化
- 历史记录列表做分页加载
- 长文本只在详情页展示
- 埋点与日志异步上报，避免阻塞主流程

### 15.3 AI 成本优化

- 控制 prompt 长度
- 做输入截断与摘要预处理
- 优先使用性价比更高模型
- 记录 tokens 用于后续成本分析

---

## 16. 日志、监控与告警

## 16.1 日志规范

```ts
type LogLevel = 'info' | 'warn' | 'error'

type LogContext = {
  requestId?: string
  userId?: string
  route?: string
  durationMs?: number
  errorCode?: string
}
```

### 16.2 必监控指标
- API 成功率
- `/api/generate` P95 延迟
- AI 调用失败率
- webhook 失败率
- 支付成功率
- 每日生成次数

### 16.3 告警建议
- 5 分钟内 AI 失败率 > 10%
- webhook 失败连续 3 次
- `/api/generate` P95 > 40 秒

---

## 17. 测试策略

## 17.1 测试分层

- 单元测试：平台模板、校验器、权限判断、工具函数
- 集成测试：API 路由、数据库读写、支付 webhook
- E2E：核心用户路径

## 17.2 必测路径

- 文案生成成功
- 单个平台失败但整体返回成功
- 超限 / 限流提示
- 链接提取成功与失败兜底
- 登录后历史记录查询
- 支付回调更新订阅状态

## 17.3 覆盖建议

| 模块 | 最低目标 |
|------|------|
| `lib/ai` | 85% |
| `lib/extract` | 80% |
| `lib/billing` | 80% |
| `app/api/*` | 80% |
| 关键组件 | 70% |

---

## 18. 环境变量

```bash
APP_URL=
NODE_ENV=

DASHSCOPE_API_KEY=
AI_FALLBACK_PROVIDER=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMON_VARIANT_CREATOR=
LEMON_VARIANT_STUDIO=
LEMON_VARIANT_ENTERPRISE=

POSTHOG_KEY=
POSTHOG_HOST=
```

### 18.1 环境要求
- 本地、预发、生产分离
- 禁止将生产密钥用于本地开发
- webhook secret 与 API key 分别管理

---

## 19. 部署方案

### 19.1 部署拓扑
- Web 与 API：Vercel
- 数据与认证：Supabase
- 限流与缓存：Upstash
- 支付：Lemon Squeezy

### 19.2 发布流程
1. 合并到主分支
2. 触发 CI：lint、typecheck、test、build
3. 自动部署到预发
4. 手动验证关键路径
5. 发布生产

### 19.3 回滚策略
- 前端问题：Vercel 回滚到上一个 deployment
- 数据问题：通过 migration 回滚或补丁修复
- 支付问题：暂停 checkout 并保留 webhook 消费

---

## 20. 开发规范

### 20.1 代码规范
- TypeScript `strict` 开启
- ESLint + Prettier 必须通过
- 统一使用绝对路径别名 `@/`

### 20.2 命名规范
- 组件：PascalCase
- hooks：`useXxx`
- 工具函数：camelCase
- 常量：UPPER_SNAKE_CASE
- API 错误码：UPPER_SNAKE_CASE

### 20.3 Git 规范

```text
feat(generate): add platform generation pipeline
fix(billing): handle duplicated webhook events
docs(tdd): refine database and api design
```

---

## 21. 开发里程碑与交付

### MVP
- 输入、选择平台、生成、结果展示、复制
- 本地历史记录
- 基础日志和埋点
- 部署上线

### v1.0
- 登录与云端历史
- 订阅支付
- 使用统计
- 风控与审核

### v2.0
- 批量处理
- 自定义模板
- 团队能力
- API 与插件

---

## 22. 本次修订重点

相较原稿，本次主要优化：
- 统一了技术设计主线，不再只是罗列代码片段
- 增加架构决策、模块职责、边界和演进原则
- 强化了数据模型设计说明与权限策略
- API 设计更接近实际工程实现，补齐错误码与幂等要求
- 明确了安全、性能、监控、回滚和测试要求
- 去掉了一些“写了但不可直接执行”的伪实现表述，改为可落地约束

---

## 23. 待确认技术问题

- MVP 是否真的要支持 URL 自动提取，还是先只做手动文本输入
- 免费用户是否允许完全匿名生成，还是超过一定阈值要求登录
- 生成记录是否需要对输入内容做脱敏或摘要存储
- AI fallback 是否在 MVP 就启用，还是先只接单一 provider
- 支付集成是否一定在 v1.0 早期上线，还是先验证留存后再接

---

## 24. 结论

当前技术方案能够支撑 AutoContent Pro 从 MVP 到 v1.0 的快速落地。建议研发优先顺序为：
1. 打通生成主链路
2. 完善日志、错误处理和限流
3. 再接入登录、历史与支付

这样可以先验证产品价值，再逐步补足商业化和平台化能力。
