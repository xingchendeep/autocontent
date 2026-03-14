# 需求文档

## 简介

本 spec 涵盖 AutoContent Pro v1.0 第三阶段：云端数据与套餐基础。

范围包括：
- 将生成记录写入 `generations` 表，并同步更新 `usage_stats`，涵盖成功、部分失败、完全失败三种结果的处理策略
- `GET /api/history`（分页，仅限已认证用户）
- Dashboard 历史记录页
- `GET /api/usage` 接口及 Dashboard 使用统计卡片
- 套餐能力读取服务（服务端服务，根据 `plans` 和 `subscriptions` 表返回用户当前套餐能力对象）

本阶段依赖第一阶段（supabase-infrastructure）和第二阶段（user-authentication）已完成。
`generations`、`usage_stats`、`plans`、`subscriptions` 表及其 RLS 策略均已就位，本阶段不得重新设计。
`plans` 表种子数据已在第一阶段写入，本阶段不得重新播种或修改。

本阶段**不包含**：Lemon Squeezy checkout 或 webhook 处理、套餐限制的主动执行（由第四阶段负责）、
订阅管理页、定价页、`GET /api/history/:id` 详情接口（可在后续阶段补充）。

对应 TASKS.md：TSK-M2-010、TSK-M2-011、TSK-M2-012、TSK-M2-013、TSK-M2-014、TSK-M2-020。

---

## 术语表

- **Generation_Writer**：服务端服务（`src/lib/db/`），负责在生成尝试完成后将记录写入 `generations` 表并更新 `usage_stats`。
- **Generation_Record**：`public.generations` 表中的一行，记录一次 AI 文案生成请求的完整上下文与结果。
- **Usage_Stats_Record**：`public.usage_stats` 表中的一行，维护单个用户的月度及累计生成次数计数器。
- **History_API**：`GET /api/history` 路由，返回当前已认证用户的分页生成历史摘要列表。
- **History_Page**：位于 `/dashboard/history` 的 Next.js 页面，展示用户的历史记录列表。
- **Usage_API**：`GET /api/usage` 路由，返回当前已认证用户的使用统计摘要及套餐信息。
- **Usage_Card**：Dashboard 中展示本月生成次数、总次数和套餐信息的统计卡片组件。
- **Plan_Capability_Service**：服务端服务（`src/lib/billing/`），根据用户当前有效订阅返回 `PlanCapability` 对象；无有效订阅时回退到 `free` 套餐能力。
- **PlanCapability**：描述用户当前套餐权益的类型对象，包含 `maxPlatforms`、`monthlyGenerationLimit`、`canUseHistory`、`canUseApi`、`canUseTeam`、`speedTier` 字段。
- **Active_Subscription**：`subscriptions` 表中 `status` 为 `active`、`trialing`、`past_due` 或 `paused` 的记录，通过 `current_active_subscriptions` 视图查询。
- **Service_Role_Client**：使用 `SUPABASE_SERVICE_ROLE_KEY` 初始化的 Supabase 客户端，绕过 RLS，仅用于服务端写操作。
- **Anon_Client**：使用 `SUPABASE_ANON_KEY` 初始化的 Supabase 服务端客户端，受 RLS 约束。
- **Session**：存储在 HTTP-only cookie 中的 Supabase Auth 会话，代表一个已认证用户。
- **Dashboard**：位于 `/dashboard` 的 Next.js 页面组，仅限已认证用户访问。

---

## 需求

### 需求 1：生成记录写入

**用户故事：** 作为已认证用户，我希望每次生成尝试都被记录到云端，这样我可以在历史记录中查看所有生成结果，包括失败的请求。

#### 验收标准

1. WHEN 已认证用户的生成请求完成（无论成功、部分失败或完全失败），THE Generation_Writer SHALL 使用 Service_Role_Client 向 `generations` 表插入一条 Generation_Record。
2. WHEN 所有请求平台均生成成功时，THE Generation_Writer SHALL 将 Generation_Record 的 `status` 字段设为 `'success'`，`result_json` 包含所有平台的完整输出，`error_code` 和 `error_message` 设为 NULL。
3. WHEN 部分平台生成成功、部分平台生成失败时，THE Generation_Writer SHALL 将 Generation_Record 的 `status` 字段设为 `'partial'`，`result_json` 包含所有成功平台的输出，`error_message` 记录失败平台列表。
4. WHEN 所有请求平台均生成失败时，THE Generation_Writer SHALL 将 Generation_Record 的 `status` 字段设为 `'failed'`，`result_json` 设为空对象 `{}`，`error_code` 设为对应的错误码，`error_message` 记录失败原因。
5. THE Generation_Writer SHALL 在 Generation_Record 中记录 `platforms`（请求的平台列表）、`platform_count`（平台数量）、`input_source`、`input_content`、`model_name`、`prompt_version`、`tokens_input`、`tokens_output`、`duration_ms` 字段。
6. IF Generation_Writer 写入 `generations` 表失败，THEN THE Generation_Writer SHALL 记录带 `requestId` 的结构化错误日志，且不得因写入失败而改变已返回给用户的生成响应。
7. THE Generation_Writer SHALL 仅对已认证用户（`user_id` 不为 NULL）写入 Generation_Record；匿名用户的生成请求不写入数据库。

---

### 需求 2：使用统计写入

**用户故事：** 作为已认证用户，我希望每次生成后使用统计自动更新，这样我可以准确查看本月的使用情况。

#### 验收标准

1. WHEN Generation_Writer 成功将 Generation_Record 写入 `generations` 表后，THE Generation_Writer SHALL 使用 Service_Role_Client 对 `usage_stats` 表执行 upsert 操作，将 `monthly_generation_count` 加 1，`total_generation_count` 加 1，`last_generation_at` 更新为当前时间戳。
2. WHEN `usage_stats` 中不存在该用户的记录时，THE Generation_Writer SHALL 插入新行，`current_month` 设为当前 `YYYY-MM` 格式的月份字符串，`monthly_generation_count` 设为 1，`total_generation_count` 设为 1。
3. WHEN `usage_stats` 中已存在该用户的记录且 `current_month` 与当前月份一致时，THE Generation_Writer SHALL 在现有行上递增计数器，不得插入新行。
4. WHEN `usage_stats` 中已存在该用户的记录但 `current_month` 与当前月份不一致时，THE Generation_Writer SHALL 将 `current_month` 更新为当前月份，`monthly_generation_count` 重置为 1，`total_generation_count` 继续递增。
5. IF Generation_Writer 更新 `usage_stats` 失败，THEN THE Generation_Writer SHALL 记录带 `requestId` 的结构化错误日志，且不得因统计更新失败而回滚已写入的 Generation_Record。

---

### 需求 3：GET /api/history 接口

**用户故事：** 作为已认证用户，我希望通过 API 获取分页的历史记录列表，这样我可以在 Dashboard 中浏览所有生成记录。

#### 验收标准

1. WHEN 已认证用户发送 `GET /api/history` 请求时，THE History_API SHALL 返回该用户的 Generation_Record 摘要列表，按 `created_at DESC` 排序。
2. THE History_API SHALL 支持以下查询参数：`page`（默认 1，最小值 1）、`limit`（默认 20，最大值 100）、`platform`（按平台过滤，可选）、`status`（按状态过滤，可选，值为 `success`、`failed`、`partial`）。
3. THE History_API SHALL 在响应的 `data.pagination` 字段中返回 `page`、`limit`、`total`、`hasMore` 四个分页字段。
4. THE History_API SHALL 在列表项中仅返回摘要字段：`id`、`inputSource`、`platforms`、`platformCount`、`status`、`modelName`、`durationMs`、`createdAt`，不得返回 `input_content` 或完整 `result_json`。
5. WHEN 未认证用户发送 `GET /api/history` 请求时，THE History_API SHALL 返回 HTTP 401 及错误码 `UNAUTHORIZED`。
6. IF `page` 或 `limit` 参数不合法（非正整数、`limit` 超过 100），THEN THE History_API SHALL 返回 HTTP 400 及错误码 `INVALID_INPUT`。
7. THE History_API SHALL 仅返回 `user_id = auth.uid()` 的记录，不得通过查询参数或请求体接受客户端传入的用户 ID。
8. THE History_API SHALL 在响应中包含 `requestId` 和 `timestamp` 字段，遵循统一 `ApiSuccess<T>` 响应格式。

---

### 需求 4：Dashboard 历史记录页

**用户故事：** 作为已认证用户，我希望在 Dashboard 中查看历史记录列表，这样我可以回顾过去的生成结果。

#### 验收标准

1. THE History_Page SHALL 可通过路径 `/dashboard/history` 访问，且受 Middleware 路由保护，未认证用户将被重定向至 `/login`。
2. THE History_Page SHALL 展示历史记录列表，每条记录显示：生成时间、请求平台列表、生成状态（成功/部分失败/失败）、生成耗时。
3. THE History_Page SHALL 支持分页浏览，用户可通过翻页控件加载更多历史记录。
4. WHEN 用户的历史记录为空时，THE History_Page SHALL 展示空状态提示，引导用户前往首页进行生成。
5. WHEN History_API 返回错误时，THE History_Page SHALL 展示错误提示信息，不得渲染空白页面。
6. WHILE 历史记录数据加载中时，THE History_Page SHALL 展示加载状态指示器。

---

### 需求 5：GET /api/usage 接口

**用户故事：** 作为已认证用户，我希望通过 API 获取使用统计摘要，这样我可以了解本月的生成次数和当前套餐信息。

#### 验收标准

1. WHEN 已认证用户发送 `GET /api/usage` 请求时，THE Usage_API SHALL 返回包含以下字段的数据对象：`currentMonth`（`YYYY-MM` 格式）、`monthlyGenerationCount`、`totalGenerationCount`、`lastGenerationAt`（可为 null）。
2. THE Usage_API SHALL 在响应的 `data.plan` 字段中返回用户当前套餐信息：`code`、`displayName`、`monthlyGenerationLimit`（可为 null 表示无限制）、`platformLimit`（可为 null 表示无限制）、`speedTier`。
3. WHEN 用户尚无 `usage_stats` 记录时，THE Usage_API SHALL 返回 `monthlyGenerationCount: 0`、`totalGenerationCount: 0`、`lastGenerationAt: null`，以及当前月份。
4. WHEN 未认证用户发送 `GET /api/usage` 请求时，THE Usage_API SHALL 返回 HTTP 401 及错误码 `UNAUTHORIZED`。
5. THE Usage_API SHALL 在响应中包含 `requestId` 和 `timestamp` 字段，遵循统一 `ApiSuccess<T>` 响应格式。

---

### 需求 6：Dashboard 使用统计卡片

**用户故事：** 作为已认证用户，我希望在 Dashboard 中看到使用统计卡片，这样我可以快速了解本月的使用情况和当前套餐。

#### 验收标准

1. THE Usage_Card SHALL 在 Dashboard 页面中展示本月生成次数（`monthlyGenerationCount`）及套餐月度限额（`monthlyGenerationLimit`，无限制时显示"无限制"）。
2. THE Usage_Card SHALL 展示当前套餐名称（`displayName`）和速度等级（`speedTier`）。
3. WHEN `monthlyGenerationLimit` 不为 null 时，THE Usage_Card SHALL 以进度条或数值对比形式展示已用次数与限额的比例。
4. WHILE Usage_API 数据加载中时，THE Usage_Card SHALL 展示骨架屏或加载占位符，不得渲染空白区域。
5. WHEN Usage_API 返回错误时，THE Usage_Card SHALL 展示错误提示，不得因统计卡片加载失败而影响 Dashboard 其他区域的渲染。

---

### 需求 7：套餐能力读取服务

**用户故事：** 作为后端工程师，我希望有一个统一的服务端服务来读取用户当前套餐能力，这样后续阶段可以通过统一接口执行套餐限制，而无需在多处重复查询数据库。

#### 验收标准

1. THE Plan_Capability_Service SHALL 暴露一个 `getPlanCapability(userId: string): Promise<PlanCapability>` 函数，接受用户 UUID，返回 `PlanCapability` 对象。
2. THE Plan_Capability_Service SHALL 通过查询 `current_active_subscriptions` 视图获取用户当前有效订阅，再关联 `plans` 表读取套餐字段。
3. WHEN 用户存在有效订阅（Active_Subscription）时，THE Plan_Capability_Service SHALL 根据关联套餐的字段构建并返回 `PlanCapability` 对象。
4. WHEN 用户不存在任何有效订阅时，THE Plan_Capability_Service SHALL 查询 `plans` 表中 `code = 'free'` 的行，并以该行数据构建并返回 `PlanCapability` 对象。
5. THE Plan_Capability_Service 返回的 `PlanCapability` 对象 SHALL 包含以下字段：`maxPlatforms`（对应 `platform_limit`，NULL 时表示无限制）、`monthlyGenerationLimit`（对应 `monthly_generation_limit`，NULL 时表示无限制）、`canUseHistory`（对应 `has_history`）、`canUseApi`（对应 `has_api_access`）、`canUseTeam`（对应 `has_team_access`）、`speedTier`（对应 `speed_tier`）。
6. THE Plan_Capability_Service SHALL 使用 Service_Role_Client 执行数据库查询，以确保绕过 RLS 并在服务端安全读取。
7. IF 数据库查询失败，THEN THE Plan_Capability_Service SHALL 抛出包含结构化错误信息的异常，由调用方决定降级策略。
8. THE Plan_Capability_Service SHALL 不执行任何套餐限制校验或拦截逻辑；限制执行由第四阶段负责。

---

### 需求 8：数据一致性与错误隔离

**用户故事：** 作为后端工程师，我希望生成记录写入和统计更新的失败不影响用户收到生成结果，这样数据层的问题不会降低核心生成体验的可用性。

#### 验收标准

1. THE Generation_Writer SHALL 在生成服务返回结果之后、API 路由向客户端发送响应之前，异步执行数据库写入操作，不得阻塞响应返回。
2. IF `generations` 表写入失败，THEN THE Generation_Writer SHALL 记录错误日志，且 `/api/generate` 路由 SHALL 仍向客户端返回生成结果（HTTP 200）。
3. IF `usage_stats` 更新失败，THEN THE Generation_Writer SHALL 记录错误日志，且不得回滚已成功写入的 Generation_Record。
4. THE Generation_Writer SHALL 在错误日志中包含 `requestId`、`userId`、`errorCode` 字段，以支持问题定位。
