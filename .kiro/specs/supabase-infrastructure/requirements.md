# 需求文档

## 简介

本功能为 AutoContent Pro v1.0 建立 Supabase 数据库基础层。
范围涵盖 Supabase 项目初始化、迁移框架搭建、所有核心表定义、
`plans` 表的初始种子数据，以及行级安全（RLS）策略。

本阶段严格限定为基础设施层，不包含 Auth UI、应用 API 路由或支付/计费逻辑。
所有后续 v1.0 阶段（Auth 集成、云端历史记录、计费）必须在此基础上构建，不得重新设计。

对应 TASKS.md：TSK-M2-001、TSK-M2-002、TSK-M2-003。

---

## 术语表

- **Migration_Runner**：Supabase CLI 工具（`supabase db push` / `supabase migration up`），用于将 SQL 迁移文件应用到目标数据库。
- **Migration_File**：位于 `supabase/migrations/` 下的带时间戳 `.sql` 文件，每个环境只应用一次。
- **Schema**：所有应用表所在的 `public` Postgres 模式。
- **RLS**：行级安全（Row Level Security）——Postgres 特性，限制数据库角色可访问的行。
- **Service_Role**：绕过 RLS 的 Supabase 服务角色密钥，仅供服务端进程使用。
- **Anon_Role**：用于未认证客户端请求的 Supabase 匿名角色。
- **Auth_User**：由 Supabase Auth 管理的 `auth.users` 记录，是权威身份来源。
- **profiles**：扩展 `auth.users` 的应用层用户资料表。
- **plans**：定义订阅套餐及其能力的静态配置表。
- **subscriptions**：通过支付提供商将 Auth_User 与套餐关联的记录。
- **generations**：每次 AI 文案生成请求及其结果的记录。
- **usage_stats**：按用户优化读取的月度及总生成次数计数器。
- **audit_logs**：安全相关和业务关键事件的只追加日志。
- **webhook_events**：入站支付提供商 Webhook 载荷的幂等性存储。
- **current_active_subscriptions**：返回每个用户最新有效订阅的辅助视图。
- **Seed_Data**：作为迁移的一部分插入 `plans` 的初始行，代表四个产品套餐。
- **Local_Environment**：运行 `supabase start` 的开发者本地机器（Supabase 本地栈）。
- **Staging_Environment**：用于预生产验证的专用 Supabase 项目。

---

## 需求

### 需求 1：Supabase 项目初始化

**用户故事：** 作为后端工程师，我希望配置好 Supabase 项目和本地开发栈，以便团队能在各环境中一致地运行和验证数据库迁移。

#### 验收标准

1. 执行 `supabase db push` 时，Migration_Runner 应将所有迁移文件无错误地应用到 Local_Environment。
2. 针对 Staging 项目执行 `supabase db push` 时，Migration_Runner 应将所有迁移文件无错误地应用到 Staging_Environment。
3. 当迁移文件已在某环境中应用过时，Migration_Runner 应跳过该文件，不重复应用。
4. Schema 应在目标 Supabase 项目的 `public` Postgres 模式中创建。
5. Migration_Runner 应在任何建表语句执行前启用 `pgcrypto` 扩展。

---

### 需求 2：迁移框架搭建

**用户故事：** 作为后端工程师，我希望有一套结构化的迁移文件规范，以便 Schema 变更可版本化、可复现，并能安全地增量应用。

#### 验收标准

1. Migration_File 应遵循命名规范 `<timestamp>_<description>.sql`，其中 `<timestamp>` 为 14 位 UTC 时间戳（YYYYMMDDHHmmss）。
2. Migration_File 应具备幂等性：在已应用过该文件的数据库上重新运行，不应产生错误或意外状态变更。
3. Migration_File 中所有 DDL 语句应使用 `CREATE TABLE IF NOT EXISTS` 和 `CREATE INDEX IF NOT EXISTS`。
4. Migration_File 应将所有语句包裹在单个 `BEGIN` / `COMMIT` 事务块中。
5. Migration_File 应包含 `set_updated_at` 触发器函数，在所有带 `updated_at` 列的表的每次 `BEFORE UPDATE` 事件中将 `updated_at` 设为 `now()`。

---

### 需求 3：profiles 表

**用户故事：** 作为后端工程师，我希望有一张 `profiles` 表来扩展 Supabase Auth 用户的应用专属字段，以便应用可以存储显示偏好而无需修改 auth 模式。

#### 验收标准

1. Schema 应包含 `profiles` 表，列定义如下：`id`（UUID，主键，外键指向 `auth.users(id)`，`ON DELETE CASCADE`）、`display_name`（VARCHAR 100，可为空）、`avatar_url`（TEXT，可为空）、`default_tone`（VARCHAR 30，可为空）、`default_language`（VARCHAR 20，NOT NULL，默认 `'zh-CN'`）、`created_at`（TIMESTAMPTZ，NOT NULL，默认 `now()`）、`updated_at`（TIMESTAMPTZ，NOT NULL，默认 `now()`）。
2. 当 `profiles` 中的行被更新时，Schema 应通过 `set_updated_at` 触发器自动将 `updated_at` 设为当前时间戳。
3. 当对应的 `auth.users` 记录被删除时，Schema 应级联删除关联的 `profiles` 行。

---

### 需求 4：plans 表与种子数据

**用户故事：** 作为后端工程师，我希望 `plans` 表预填充四个产品套餐，以便应用从第一天起就能执行基于套餐的能力限制，无需手动录入数据。

#### 验收标准

1. Schema 应包含 `plans` 表，列定义如下：`id`（UUID，主键，默认 `gen_random_uuid()`）、`code`（VARCHAR 50，NOT NULL，UNIQUE）、`display_name`（VARCHAR 100，NOT NULL）、`price_cents`（INTEGER，NOT NULL，默认 0，CHECK >= 0）、`currency`（VARCHAR 10，NOT NULL，默认 `'USD'`）、`monthly_generation_limit`（INTEGER，可为空）、`platform_limit`（INTEGER，可为空）、`speed_tier`（VARCHAR 20，NOT NULL，默认 `'standard'`）、`has_history`（BOOLEAN，NOT NULL，默认 TRUE）、`has_api_access`（BOOLEAN，NOT NULL，默认 FALSE）、`has_team_access`（BOOLEAN，NOT NULL，默认 FALSE）、`is_active`（BOOLEAN，NOT NULL，默认 TRUE）、`metadata`（JSONB，NOT NULL，默认 `'{}'`）、`created_at`（TIMESTAMPTZ，NOT NULL，默认 `now()`）、`updated_at`（TIMESTAMPTZ，NOT NULL，默认 `now()`）。
2. Schema 应对 `speed_tier` 列强制 CHECK 约束，限定值为 `('standard', 'fast', 'priority', 'dedicated')`。
3. 当 `plans` 中的行被更新时，Schema 应通过 `set_updated_at` 触发器自动将 `updated_at` 设为当前时间戳。
4. Migration_File 应使用 `ON CONFLICT (code) DO UPDATE` 向 `plans` 插入以下四条种子行以保持幂等性：
   - `free`：价格 0，monthly_generation_limit 30，platform_limit 3，speed_tier `standard`，has_api_access FALSE，has_team_access FALSE。
   - `creator`：价格 2900 分，monthly_generation_limit NULL（无限制），platform_limit 10，speed_tier `fast`，has_api_access FALSE，has_team_access FALSE。
   - `studio`：价格 7900 分，monthly_generation_limit NULL，platform_limit 10，speed_tier `priority`，has_api_access FALSE，has_team_access TRUE。
   - `enterprise`：价格 19900 分，monthly_generation_limit NULL，platform_limit NULL（无限制），speed_tier `dedicated`，has_api_access TRUE，has_team_access TRUE。
5. 当 Migration_File 应用到已包含种子行的环境时，应更新现有行以匹配规范值，而非插入重复数据。

---

### 需求 5：subscriptions 表

**用户故事：** 作为后端工程师，我希望有一张 `subscriptions` 表记录每个用户的套餐归属和支付提供商详情，以便应用能确定用户当前的权益。

#### 验收标准

1. Schema 应包含 `subscriptions` 表，列定义如下：`id`（UUID，主键，默认 `gen_random_uuid()`）、`user_id`（UUID，NOT NULL，外键指向 `auth.users(id)`，ON DELETE CASCADE）、`plan_id`（UUID，NOT NULL，外键指向 `plans(id)`）、`provider`（VARCHAR 30，NOT NULL，默认 `'lemonsqueezy'`）、`provider_order_id`（VARCHAR 255，可为空）、`provider_subscription_id`（VARCHAR 255，可为空）、`status`（VARCHAR 30，NOT NULL）、`current_period_start`（TIMESTAMPTZ，可为空）、`current_period_end`（TIMESTAMPTZ，可为空）、`cancelled_at`（TIMESTAMPTZ，可为空）、`metadata`（JSONB，NOT NULL，默认 `'{}'`）、`created_at`（TIMESTAMPTZ，NOT NULL，默认 `now()`）、`updated_at`（TIMESTAMPTZ，NOT NULL，默认 `now()`）。
2. Schema 应对 `status` 列强制 CHECK 约束，限定值为 `('active', 'cancelled', 'expired', 'past_due', 'trialing', 'paused')`。
3. Schema 应在 `provider_subscription_id IS NOT NULL` 条件下对 `provider_subscription_id` 创建 UNIQUE 索引，防止同一提供商的重复订阅记录。
4. Schema 应在 `subscriptions(user_id)` 和 `subscriptions(status)` 上创建索引以支持高效查询。
5. 当 `subscriptions` 中的行被更新时，Schema 应通过 `set_updated_at` 触发器自动将 `updated_at` 设为当前时间戳。
6. 当对应的 `auth.users` 记录被删除时，Schema 应级联删除所有关联的 `subscriptions` 行。

---

### 需求 6：generations 表

**用户故事：** 作为后端工程师，我希望有一张 `generations` 表记录每次 AI 文案生成请求，以便应用支持云端历史记录、用量追踪和成本分析。

#### 验收标准

1. Schema 应包含 `generations` 表，列定义如下：`id`（UUID，主键，默认 `gen_random_uuid()`）、`user_id`（UUID，可为空，外键指向 `auth.users(id)`，ON DELETE SET NULL）、`input_source`（VARCHAR 30，NOT NULL，默认 `'manual'`）、`input_content`（TEXT，NOT NULL）、`extracted_url`（TEXT，可为空）、`platforms`（TEXT[]，NOT NULL）、`platform_count`（INTEGER，NOT NULL，CHECK >= 1）、`result_json`（JSONB，NOT NULL）、`prompt_version`（VARCHAR 50，可为空）、`model_name`（VARCHAR 100，可为空）、`tokens_input`（INTEGER，NOT NULL，默认 0，CHECK >= 0）、`tokens_output`（INTEGER，NOT NULL，默认 0，CHECK >= 0）、`duration_ms`（INTEGER，NOT NULL，默认 0，CHECK >= 0）、`status`（VARCHAR 30，NOT NULL，默认 `'success'`）、`error_code`（VARCHAR 100，可为空）、`error_message`（TEXT，可为空）、`created_at`（TIMESTAMPTZ，NOT NULL，默认 `now()`）。
2. Schema 应对 `input_source` 列强制 CHECK 约束，限定值为 `('manual', 'extract')`。
3. Schema 应对 `status` 列强制 CHECK 约束，限定值为 `('success', 'failed', 'partial')`。
4. Schema 应在 `generations(user_id)`、`generations(created_at DESC)` 和 `generations(status)` 上创建索引。
5. 当对应的 `auth.users` 记录被删除时，Schema 应将关联 `generations` 行的 `user_id` 设为 NULL（保留生成记录用于数据分析）。

---

### 需求 7：usage_stats 表

**用户故事：** 作为后端工程师，我希望有一张 `usage_stats` 表维护每用户的生成次数计数器，以便应用能高效执行月度套餐限制并展示用量摘要，而无需全表扫描 `generations`。

#### 验收标准

1. Schema 应包含 `usage_stats` 表，列定义如下：`user_id`（UUID，主键，外键指向 `auth.users(id)`，ON DELETE CASCADE）、`current_month`（CHAR 7，NOT NULL，格式 `YYYY-MM`）、`monthly_generation_count`（INTEGER，NOT NULL，默认 0，CHECK >= 0）、`total_generation_count`（INTEGER，NOT NULL，默认 0，CHECK >= 0）、`last_generation_at`（TIMESTAMPTZ，可为空）、`updated_at`（TIMESTAMPTZ，NOT NULL，默认 `now()`）。
2. 当 `usage_stats` 中的行被更新时，Schema 应通过 `set_updated_at` 触发器自动将 `updated_at` 设为当前时间戳。
3. 当对应的 `auth.users` 记录被删除时，Schema 应级联删除关联的 `usage_stats` 行。

---

### 需求 8：audit_logs 表

**用户故事：** 作为后端工程师，我希望有一张 `audit_logs` 表记录安全相关和业务关键事件，以便团队能调查事故并满足合规要求。

#### 验收标准

1. Schema 应包含 `audit_logs` 表，列定义如下：`id`（UUID，主键，默认 `gen_random_uuid()`）、`user_id`（UUID，可为空，外键指向 `auth.users(id)`，ON DELETE SET NULL）、`action`（VARCHAR 100，NOT NULL）、`resource_type`（VARCHAR 100，可为空）、`resource_id`（VARCHAR 100，可为空）、`ip_address`（INET，可为空）、`user_agent`（TEXT，可为空）、`metadata`（JSONB，NOT NULL，默认 `'{}'`）、`created_at`（TIMESTAMPTZ，NOT NULL，默认 `now()`）。
2. Schema 应在 `audit_logs(action)`、`audit_logs(created_at DESC)` 和 `audit_logs(user_id)` 上创建索引。
3. Schema 不应在 `audit_logs` 上包含 `updated_at` 列，因为审计记录是只追加的，插入后不得修改。

---

### 需求 9：webhook_events 表

**用户故事：** 作为后端工程师，我希望有一张 `webhook_events` 表存储入站支付提供商的 Webhook 载荷，以便应用能保证幂等处理并防止重复的订阅状态变更。

#### 验收标准

1. Schema 应包含 `webhook_events` 表，列定义如下：`id`（UUID，主键，默认 `gen_random_uuid()`）、`provider`（VARCHAR 30，NOT NULL）、`event_name`（VARCHAR 100，NOT NULL）、`event_id`（VARCHAR 255，NOT NULL）、`processed_at`（TIMESTAMPTZ，可为空）、`payload`（JSONB，NOT NULL，默认 `'{}'`）、`created_at`（TIMESTAMPTZ，NOT NULL，默认 `now()`）。
2. Schema 应对 `(provider, event_id)` 强制 UNIQUE 约束，防止同一提供商事件被插入两次。
3. 当插入重复 `(provider, event_id)` 组合的 Webhook 事件时，Schema 应以唯一约束冲突拒绝插入，允许应用层检测并跳过重复处理。

---

### 需求 10：current_active_subscriptions 视图

**用户故事：** 作为后端工程师，我希望有一个 `current_active_subscriptions` 视图返回每个用户最新的有效订阅，以便应用代码能通过单次查询解析用户当前套餐。

#### 验收标准

1. Schema 应包含名为 `current_active_subscriptions` 的视图，该视图关联 `subscriptions` 和 `plans`，返回每个用户状态在 `('active', 'trialing', 'past_due', 'paused')` 中最近更新的一条订阅记录。
2. `current_active_subscriptions` 视图应暴露以下列：`id`、`user_id`、`plan_id`、`plan_code`、`plan_display_name`、`status`、`current_period_start`、`current_period_end`、`updated_at`。
3. 当用户没有任何有效状态的订阅时，`current_active_subscriptions` 视图应对该用户返回零行。

---

### 需求 11：行级安全 — profiles

**用户故事：** 作为后端工程师，我希望在 `profiles` 上配置 RLS 策略，使已认证用户只能读取和修改自己的资料行。

#### 验收标准

1. Schema 应在 `profiles` 表上启用 RLS。
2. 当已认证用户对 `profiles` 执行 SELECT 时，Schema 应只返回 `id = auth.uid()` 的行。
3. 当已认证用户对 `profiles` 执行 INSERT 时，Schema 应仅在 `id = auth.uid()` 时允许插入。
4. 当已认证用户对 `profiles` 执行 UPDATE 时，Schema 应仅在 `id = auth.uid()` 时允许更新。
5. 当 Anon_Role 或未认证会话查询 `profiles` 时，Schema 应返回零行。

---

### 需求 12：行级安全 — subscriptions

**用户故事：** 作为后端工程师，我希望在 `subscriptions` 上配置 RLS 策略，使已认证用户只能读取自己的订阅记录。

#### 验收标准

1. Schema 应在 `subscriptions` 表上启用 RLS。
2. 当已认证用户对 `subscriptions` 执行 SELECT 时，Schema 应只返回 `user_id = auth.uid()` 的行。
3. Schema 不应为已认证角色在 `subscriptions` 上定义 INSERT 或 UPDATE 策略；所有对 `subscriptions` 的写入应专由 Service_Role 执行。
4. 当 Anon_Role 或未认证会话查询 `subscriptions` 时，Schema 应返回零行。

---

### 需求 13：行级安全 — generations

**用户故事：** 作为后端工程师，我希望在 `generations` 上配置 RLS 策略，使已认证用户只能读取和插入自己的生成记录。

#### 验收标准

1. Schema 应在 `generations` 表上启用 RLS。
2. 当已认证用户对 `generations` 执行 SELECT 时，Schema 应只返回 `user_id = auth.uid()` 的行。
3. 当已认证用户对 `generations` 执行 INSERT 时，Schema 应仅在 `user_id = auth.uid()` 时允许插入。
4. 当 Anon_Role 或未认证会话查询 `generations` 时，Schema 应返回零行。

---

### 需求 14：行级安全 — usage_stats

**用户故事：** 作为后端工程师，我希望在 `usage_stats` 上配置 RLS 策略，使已认证用户可以读取自己的用量计数器，而所有写入保留给 Service_Role。

#### 验收标准

1. Schema 应在 `usage_stats` 表上启用 RLS。
2. 当已认证用户对 `usage_stats` 执行 SELECT 时，Schema 应只返回 `user_id = auth.uid()` 的行。
3. 当已认证用户对 `usage_stats` 执行 UPDATE 时，Schema 应仅在 `user_id = auth.uid()` 时允许更新。
4. 当 Anon_Role 或未认证会话查询 `usage_stats` 时，Schema 应返回零行。

---

### 需求 15：行级安全 — audit_logs 与 webhook_events

**用户故事：** 作为后端工程师，我希望在 `audit_logs` 和 `webhook_events` 上启用 RLS，且不为已认证或匿名角色定义任何宽松策略，使这两张表只能通过 Service_Role 访问。

#### 验收标准

1. Schema 应在 `audit_logs` 表上启用 RLS。
2. Schema 应在 `webhook_events` 表上启用 RLS。
3. 当任何非 Service_Role 会话查询 `audit_logs` 时，Schema 应返回零行。
4. 当任何非 Service_Role 会话查询 `webhook_events` 时，Schema 应返回零行。
5. Schema 不应为已认证或匿名角色在 `audit_logs` 或 `webhook_events` 上定义任何 SELECT、INSERT、UPDATE 或 DELETE 策略。

---

### 需求 16：迁移验证

**用户故事：** 作为后端工程师，我希望有一套明确的迁移验证流程，以便在推送到 Staging 或生产环境前确认 Schema 正确无误。

#### 验收标准

1. 当迁移应用到 Local_Environment 时，Migration_Runner 应无任何 SQL 错误或约束冲突地完成。
2. 当迁移应用到 Staging_Environment 时，Migration_Runner 应无任何 SQL 错误或约束冲突地完成。
3. 迁移应用后，Schema 应包含全部七张表：`profiles`、`plans`、`subscriptions`、`generations`、`usage_stats`、`audit_logs`、`webhook_events`。
4. 迁移应用后，Schema 应包含 `current_active_subscriptions` 视图。
5. 迁移应用后，`plans` 表应恰好包含四行，code 分别为 `free`、`creator`、`studio`、`enterprise`。
6. 迁移应用后，Schema 应在全部六张表上启用 RLS：`profiles`、`subscriptions`、`generations`、`usage_stats`、`audit_logs`、`webhook_events`。
7. 若在同一环境中第二次运行迁移，Migration_Runner 应无错误地完成（幂等性保证）。
