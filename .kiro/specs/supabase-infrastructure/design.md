# 设计文档：supabase-infrastructure

## 概述

本文档描述 AutoContent Pro v1.0 的数据库基础层。范围严格限定为基础设施：
Supabase 项目初始化、迁移框架、所有核心表定义、`plans` 表的种子数据、
行级安全策略，以及验证流程。

不包含 Auth UI、应用 API 路由或计费逻辑。所有后续 v1.0 阶段
（Auth 集成、云端历史记录、计费）必须在此 Schema 基础上构建，不得重新设计。

对应 TASKS.md：TSK-M2-001、TSK-M2-002、TSK-M2-003。

---

## 架构

### 高层目录结构

```
supabase/
  migrations/
    20260313000000_initial_schema.sql   ← 本阶段唯一迁移文件
  seed.sql                              ← 不使用；种子数据已内嵌于迁移文件
  config.toml                           ← Supabase CLI 项目配置
```

Supabase CLI（`supabase`）管理本地开发栈并将迁移应用到远程项目。
所有 DDL 存放于 `supabase/migrations/` 下的带时间戳迁移文件中。
应用层（Next.js）不直接执行 DDL，只通过 Supabase 客户端读写数据。

### 环境模型

```
本地（supabase start）
  └─ Postgres 15 + GoTrue + Storage + Studio
       └─ 迁移应用方式：supabase db push

Staging（Supabase 项目：autocontent-pro-staging）
  └─ 迁移应用方式：supabase db push --linked

生产（Supabase 项目：autocontent-pro-prod）
  └─ 迁移应用方式：supabase db push --linked（Staging 验证通过后）
```

CLI 通过 `supabase_migrations.schema_migrations` 表追踪已应用的迁移，
每个文件在每个环境中只应用一次。

### 依赖关系图

```
pgcrypto 扩展
  └─ set_updated_at() 触发器函数
       ├─ profiles
       ├─ plans  ──→  种子行（4 个套餐）
       │               └─ subscriptions
       ├─ generations
       ├─ usage_stats
       ├─ audit_logs
       └─ webhook_events

subscriptions + plans ──→ current_active_subscriptions（视图）

RLS 策略在所有表创建完成后应用
```

---

## 组件与接口

### 迁移文件

单个迁移文件 `20260313000000_initial_schema.sql` 包含本阶段所有 DDL，
包裹在 `BEGIN` / `COMMIT` 事务中。文件具备幂等性：所有语句使用
`CREATE TABLE IF NOT EXISTS`、`CREATE INDEX IF NOT EXISTS`、
`CREATE OR REPLACE FUNCTION`、`CREATE OR REPLACE VIEW`，
种子插入使用 `ON CONFLICT … DO UPDATE`。

### Supabase CLI 配置（`supabase/config.toml`）

最小化配置，指向本地栈端口和项目引用。开发者运行：

```bash
supabase start             # 启动本地栈
supabase db push           # 将待应用迁移推送到本地数据库
supabase db push --linked  # 推送到已关联的远程项目
```

### TypeScript 数据库类型（`src/types/database.ts`）

迁移应用后，Supabase CLI 可生成 TypeScript 类型：

```bash
supabase gen types typescript --local > src/types/database.ts
```

该文件供后续阶段的 `src/lib/db/` 模块使用。它不属于本阶段的交付物，
但迁移必须足够稳定以生成干净的类型。

---

## 数据模型

所有表位于 Supabase Postgres 15 实例的 `public` 模式中。
列类型使用 `TIMESTAMPTZ`（而非裸 `TIMESTAMP`）以避免时区歧义。

### set_updated_at 触发器函数

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
```

作为 `BEFORE UPDATE FOR EACH ROW` 触发器应用于所有带 `updated_at` 列的表。

### profiles

扩展 `auth.users`，添加应用层显示偏好字段。

| 列名 | 类型 | 约束 |
|---|---|---|
| id | UUID | 主键，外键 → auth.users(id) ON DELETE CASCADE |
| display_name | VARCHAR(100) | 可为空 |
| avatar_url | TEXT | 可为空 |
| default_tone | VARCHAR(30) | 可为空 |
| default_language | VARCHAR(20) | NOT NULL，默认 `'zh-CN'` |
| created_at | TIMESTAMPTZ | NOT NULL，默认 now() |
| updated_at | TIMESTAMPTZ | NOT NULL，默认 now() |

触发器：`trg_profiles_updated_at` → `set_updated_at()`

### plans

订阅套餐的静态配置表，行由迁移文件本身插入。

| 列名 | 类型 | 约束 |
|---|---|---|
| id | UUID | 主键，默认 gen_random_uuid() |
| code | VARCHAR(50) | NOT NULL，UNIQUE |
| display_name | VARCHAR(100) | NOT NULL |
| price_cents | INTEGER | NOT NULL，默认 0，CHECK >= 0 |
| currency | VARCHAR(10) | NOT NULL，默认 `'USD'` |
| monthly_generation_limit | INTEGER | 可为空（NULL = 无限制） |
| platform_limit | INTEGER | 可为空（NULL = 无限制） |
| speed_tier | VARCHAR(20) | NOT NULL，默认 `'standard'`，CHECK IN ('standard','fast','priority','dedicated') |
| has_history | BOOLEAN | NOT NULL，默认 TRUE |
| has_api_access | BOOLEAN | NOT NULL，默认 FALSE |
| has_team_access | BOOLEAN | NOT NULL，默认 FALSE |
| is_active | BOOLEAN | NOT NULL，默认 TRUE |
| metadata | JSONB | NOT NULL，默认 `'{}'` |
| created_at | TIMESTAMPTZ | NOT NULL，默认 now() |
| updated_at | TIMESTAMPTZ | NOT NULL，默认 now() |

触发器：`trg_plans_updated_at` → `set_updated_at()`

种子行（通过 `ON CONFLICT (code) DO UPDATE` 保持幂等性）：

| code | price_cents | monthly_limit | platform_limit | speed_tier | api | team |
|---|---|---|---|---|---|---|
| free | 0 | 30 | 3 | standard | false | false |
| creator | 2900 | NULL | 10 | fast | false | false |
| studio | 7900 | NULL | 10 | priority | false | true |
| enterprise | 19900 | NULL | NULL | dedicated | true | true |

### subscriptions

通过支付提供商将用户与套餐关联。

| 列名 | 类型 | 约束 |
|---|---|---|
| id | UUID | 主键，默认 gen_random_uuid() |
| user_id | UUID | NOT NULL，外键 → auth.users(id) ON DELETE CASCADE |
| plan_id | UUID | NOT NULL，外键 → plans(id) |
| provider | VARCHAR(30) | NOT NULL，默认 `'lemonsqueezy'` |
| provider_order_id | VARCHAR(255) | 可为空 |
| provider_subscription_id | VARCHAR(255) | 可为空 |
| status | VARCHAR(30) | NOT NULL，CHECK IN ('active','cancelled','expired','past_due','trialing','paused') |
| current_period_start | TIMESTAMPTZ | 可为空 |
| current_period_end | TIMESTAMPTZ | 可为空 |
| cancelled_at | TIMESTAMPTZ | 可为空 |
| metadata | JSONB | NOT NULL，默认 `'{}'` |
| created_at | TIMESTAMPTZ | NOT NULL，默认 now() |
| updated_at | TIMESTAMPTZ | NOT NULL，默认 now() |

索引：
- `idx_subscriptions_user_id`：`(user_id)`
- `idx_subscriptions_status`：`(status)`
- `idx_subscriptions_provider_subscription_id`：UNIQUE，`(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL`

触发器：`trg_subscriptions_updated_at` → `set_updated_at()`

### generations

每次 AI 文案生成请求的不可变记录。

| 列名 | 类型 | 约束 |
|---|---|---|
| id | UUID | 主键，默认 gen_random_uuid() |
| user_id | UUID | 可为空，外键 → auth.users(id) ON DELETE SET NULL |
| input_source | VARCHAR(30) | NOT NULL，默认 `'manual'`，CHECK IN ('manual','extract') |
| input_content | TEXT | NOT NULL |
| extracted_url | TEXT | 可为空 |
| platforms | TEXT[] | NOT NULL |
| platform_count | INTEGER | NOT NULL，CHECK >= 1 |
| result_json | JSONB | NOT NULL |
| prompt_version | VARCHAR(50) | 可为空 |
| model_name | VARCHAR(100) | 可为空 |
| tokens_input | INTEGER | NOT NULL，默认 0，CHECK >= 0 |
| tokens_output | INTEGER | NOT NULL，默认 0，CHECK >= 0 |
| duration_ms | INTEGER | NOT NULL，默认 0，CHECK >= 0 |
| status | VARCHAR(30) | NOT NULL，默认 `'success'`，CHECK IN ('success','failed','partial') |
| error_code | VARCHAR(100) | 可为空 |
| error_message | TEXT | 可为空 |
| created_at | TIMESTAMPTZ | NOT NULL，默认 now() |

无 `updated_at`——generations 为只追加表。

索引：
- `idx_generations_user_id`：`(user_id)`
- `idx_generations_created_at`：`(created_at DESC)`
- `idx_generations_status`：`(status)`

### usage_stats

读取优化的每用户计数器，非权威数据源，派生自 `generations`。

| 列名 | 类型 | 约束 |
|---|---|---|
| user_id | UUID | 主键，外键 → auth.users(id) ON DELETE CASCADE |
| current_month | CHAR(7) | NOT NULL（格式 YYYY-MM） |
| monthly_generation_count | INTEGER | NOT NULL，默认 0，CHECK >= 0 |
| total_generation_count | INTEGER | NOT NULL，默认 0，CHECK >= 0 |
| last_generation_at | TIMESTAMPTZ | 可为空 |
| updated_at | TIMESTAMPTZ | NOT NULL，默认 now() |

触发器：`trg_usage_stats_updated_at` → `set_updated_at()`

### audit_logs

只追加事件日志，无 `updated_at` 列——记录插入后不得修改。

| 列名 | 类型 | 约束 |
|---|---|---|
| id | UUID | 主键，默认 gen_random_uuid() |
| user_id | UUID | 可为空，外键 → auth.users(id) ON DELETE SET NULL |
| action | VARCHAR(100) | NOT NULL |
| resource_type | VARCHAR(100) | 可为空 |
| resource_id | VARCHAR(100) | 可为空 |
| ip_address | INET | 可为空 |
| user_agent | TEXT | 可为空 |
| metadata | JSONB | NOT NULL，默认 `'{}'` |
| created_at | TIMESTAMPTZ | NOT NULL，默认 now() |

索引：
- `idx_audit_logs_action`：`(action)`
- `idx_audit_logs_created_at`：`(created_at DESC)`
- `idx_audit_logs_user_id`：`(user_id)`

### webhook_events

入站支付提供商 Webhook 的幂等性存储。

| 列名 | 类型 | 约束 |
|---|---|---|
| id | UUID | 主键，默认 gen_random_uuid() |
| provider | VARCHAR(30) | NOT NULL |
| event_name | VARCHAR(100) | NOT NULL |
| event_id | VARCHAR(255) | NOT NULL |
| processed_at | TIMESTAMPTZ | 可为空 |
| payload | JSONB | NOT NULL，默认 `'{}'` |
| created_at | TIMESTAMPTZ | NOT NULL，默认 now() |

唯一约束：`(provider, event_id)`——防止重复事件处理。

### current_active_subscriptions（视图）

返回每个用户最近更新的有效状态订阅。

```sql
CREATE OR REPLACE VIEW public.current_active_subscriptions AS
SELECT DISTINCT ON (s.user_id)
  s.id,
  s.user_id,
  s.plan_id,
  p.code          AS plan_code,
  p.display_name  AS plan_display_name,
  s.status,
  s.current_period_start,
  s.current_period_end,
  s.updated_at
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
WHERE s.status IN ('active', 'trialing', 'past_due', 'paused')
ORDER BY s.user_id, s.updated_at DESC;
```

对于没有有效状态订阅的用户，返回零行。

---

## 行级安全策略

RLS 在全部六张应用表上启用。`plans` 表是只读参考数据，无用户专属行，
不需要 RLS。`current_active_subscriptions` 视图继承底层 `subscriptions` 表的 RLS。

### 设计原则

- 已认证用户只能访问自己拥有的行（通过 `auth.uid()` 匹配）。
- 对 `subscriptions`、`usage_stats`、`audit_logs`、`webhook_events` 的所有写入
  通过 Service Role 密钥（仅服务端）执行。已认证角色在这些表上不存在宽松的 INSERT/UPDATE 策略。
- `audit_logs` 和 `webhook_events` 启用 RLS 且对已认证或匿名角色无任何宽松策略——
  对所有非 Service Role 会话实际上不可见。

### 策略汇总

| 表 | 角色 | 操作 | 策略 |
|---|---|---|---|
| profiles | authenticated | SELECT | `id = auth.uid()` |
| profiles | authenticated | INSERT | `id = auth.uid()` |
| profiles | authenticated | UPDATE | `id = auth.uid()` |
| subscriptions | authenticated | SELECT | `user_id = auth.uid()` |
| generations | authenticated | SELECT | `user_id = auth.uid()` |
| generations | authenticated | INSERT | `user_id = auth.uid()` |
| usage_stats | authenticated | SELECT | `user_id = auth.uid()` |
| usage_stats | authenticated | UPDATE | `user_id = auth.uid()` |
| audit_logs | — | — | 无宽松策略 |
| webhook_events | — | — | 无宽松策略 |

---

## 正确性属性

*属性是在系统所有有效执行中应始终成立的特征或行为——本质上是对系统应做什么的形式化陈述。属性是人类可读规范与机器可验证正确性保证之间的桥梁。*

### 属性 1：迁移幂等性

对于任意目标数据库环境，第二次应用迁移文件不应产生 SQL 错误，
且 Schema 状态应与第一次应用后完全相同。

**验证需求：2.2、4.5、16.7**

---

### 属性 2：set_updated_at 触发器在每次更新时触发

对于任意带 `updated_at` 列的表（`profiles`、`plans`、`subscriptions`、`usage_stats`），
以及该表中的任意行，对任意列执行 UPDATE 后，`updated_at` 应被设为大于或等于更新前时间戳的值。

**验证需求：2.5、3.2、4.3、5.5、7.2**

---

### 属性 3：CHECK 约束拒绝超出范围的枚举值

对于任意带枚举类 CHECK 约束列的表（`plans.speed_tier`、`subscriptions.status`、
`generations.input_source`、`generations.status`），尝试插入或更新不在允许集合中的值
应以约束冲突错误被拒绝。

**验证需求：4.2、5.2、6.2、6.3**

---

### 属性 4：级联删除传播到关联表

对于任意在 `profiles`、`subscriptions` 或 `usage_stats` 中有行的用户，
删除对应的 `auth.users` 记录后，这些表中所有关联行应被删除。

**验证需求：3.3、5.6、7.3**

---

### 属性 5：用户删除时 SET NULL 保留分析记录

对于任意在 `generations` 或 `audit_logs` 中有行的用户，
删除对应的 `auth.users` 记录后，这些行的 `user_id` 应被设为 NULL 而非删除，
以保留记录用于数据分析。

**验证需求：6.5**

---

### 属性 6：已认证用户的 RLS 行隔离

对于任意两个不同的已认证用户 A 和 B，当用户 A 查询 `profiles`、`subscriptions`、
`generations` 或 `usage_stats` 时，结果集应只包含用户 A 拥有的行，
不包含用户 B 拥有的任何行。

**验证需求：11.2、12.2、13.2、14.2**

---

### 属性 7：匿名角色 RLS 隔离

对于任意未认证（anon）会话，无论这些表中存在多少行，
查询 `profiles`、`subscriptions`、`generations` 或 `usage_stats` 应返回零行。

**验证需求：11.5、12.4、13.4、14.4**

---

### 属性 8：已认证用户的 RLS 写入隔离

对于任意已认证用户 A，尝试在 `profiles`、`subscriptions`、`generations` 或 `usage_stats`
中 INSERT 或 UPDATE 所有者字段（`id` 或 `user_id`）不等于 `auth.uid()` 的行时，
操作应被 RLS 策略拒绝。

**验证需求：11.3、11.4、12.3、13.3、14.3**

---

### 属性 9：仅限 Service Role 的表对非 Service Role 会话不可见

对于任意未使用 Service Role 密钥的会话（已认证或匿名），
无论这些表中存在多少行，查询 `audit_logs` 或 `webhook_events` 应返回零行。

**验证需求：15.3、15.4**

---

### 属性 10：current_active_subscriptions 每用户最多返回一行

对于任意拥有多条有效状态订阅（`active`、`trialing`、`past_due`、`paused`）的用户，
`current_active_subscriptions` 视图应为该用户恰好返回一行——即 `updated_at` 最新的那条。

**验证需求：10.1**

---

### 属性 11：current_active_subscriptions 对非活跃用户返回零行

对于任意订阅全部处于非活跃状态（`cancelled`、`expired`）或完全没有订阅的用户，
`current_active_subscriptions` 视图应对该用户返回零行。

**验证需求：10.3**

---

### 属性 12：迁移文件命名规范

对于 `supabase/migrations/` 目录中的任意文件，其文件名应匹配模式
`^[0-9]{14}_[a-z0-9_]+\.sql$`（14 位 UTC 时间戳后跟 snake_case 描述）。

**验证需求：2.1**

---

### 属性 13：所有 DDL 使用 IF NOT EXISTS 保护

对于任意迁移文件，每条 `CREATE TABLE`、`CREATE INDEX` 和 `CREATE UNIQUE INDEX`
语句应包含 `IF NOT EXISTS` 限定符，确保在对象已存在的数据库上重新执行时安全无误。

**验证需求：2.3**

---

## 错误处理

### 迁移错误

- 若 `pgcrypto` 不可用，迁移在 `CREATE EXTENSION` 语句处失败，整个事务回滚。
  解决方案：确保 Supabase 项目支持该扩展（Supabase Postgres 默认内置）。
- 若建表语句缺少 `IF NOT EXISTS` 且表已存在，迁移失败。幂等性要求（属性 13）可防止此情况。
- 若种子插入违反 `ON CONFLICT` 目标以外的约束，事务回滚。
  使用规范种子数据时不应发生此情况，但若 Schema 与种子数据在开发过程中出现偏差则会暴露。

### RLS 策略错误

- 违反 RLS 的查询对 SELECT 操作返回空结果集（而非错误）。
  对于 INSERT/UPDATE/DELETE，Postgres 根据策略类型（`USING` 或 `WITH CHECK`）
  返回权限拒绝错误或"零行受影响"结果。
- 后续阶段的应用代码不得假设用户范围查询的空结果意味着"数据不存在"——
  也可能意味着用户未认证。Auth 层（TSK-M2-004）负责区分这两种情况。

### 约束冲突

- CHECK 约束冲突返回 Postgres 错误码 `23514`。
- UNIQUE 约束冲突返回 Postgres 错误码 `23505`。
- 外键冲突返回 Postgres 错误码 `23503`。
- 后续阶段的应用代码应将这些错误码映射到 `API_SPEC.md` 中定义的相应 `ApiError` 码。

### Webhook 幂等性

- 向 `webhook_events` 插入重复 `(provider, event_id)` 会触发 `23505` 唯一冲突。
  计费处理器（TSK-M2-023）必须捕获此错误，将其视为跳过处理的信号，而非致命失败。

---

## 测试策略

### 双重测试方法

集成测试和基于属性的测试均为必需，两者互补：
- 集成测试验证迁移后的具体 Schema 状态和示例行为。
- 基于属性的测试验证跨生成输入的通用不变量。

### 集成测试（Vitest + Supabase 本地栈）

针对本地 Supabase 实例（`supabase start`）运行。每个测试套件在事务中应用迁移
并在测试后回滚，或使用专用测试 Schema。

关键示例测试：
- 迁移后 `public` 模式中存在全部七张表。
- `current_active_subscriptions` 视图存在。
- `plans` 表恰好包含四行，code 为 `free`、`creator`、`studio`、`enterprise`。
- `pgcrypto` 扩展存在于 `pg_extension` 中。
- `audit_logs` 无 `updated_at` 列。
- `webhook_events` 唯一约束拒绝重复 `(provider, event_id)`。
- `subscriptions` 唯一部分索引拒绝非空的重复 `provider_subscription_id`。
- 六张表均启用 RLS（查询 `pg_tables.rowsecurity`）。
- `audit_logs` 和 `webhook_events` 上不存在宽松策略（查询 `pg_policies`）。
- 迁移文件名匹配 14 位时间戳模式。
- 迁移文件中所有 DDL 语句包含 `IF NOT EXISTS`。

### 基于属性的测试（fast-check，TypeScript）

库：`fast-check`（npm 包）。每个属性测试至少运行 100 次迭代。

每个测试以如下格式添加注释标签：
`// Feature: supabase-infrastructure, Property N: <属性描述>`

| 属性 | 测试描述 |
|---|---|
| P1：迁移幂等性 | 应用迁移两次；断言 Schema 状态相同且无错误抛出 |
| P2：set_updated_at 触发器 | 对任意带 updated_at 的表，生成随机字段值，更新行，断言 updated_at 增大 |
| P3：CHECK 约束 | 对每个受约束列，生成不在允许集合中的任意字符串，断言插入被 23514 拒绝 |
| P4：级联删除 | 生成随机用户及关联行，删除用户，断言关联行消失 |
| P5：删除时 SET NULL | 生成随机用户及 generations/audit_logs 行，删除用户，断言 user_id 为 NULL |
| P6：RLS 行隔离 | 生成两个各有行的用户，以用户 A 查询，断言无用户 B 的行出现 |
| P7：RLS 匿名隔离 | 生成任意用户的行，以匿名角色查询，断言返回零行 |
| P8：RLS 写入隔离 | 生成两个用户，以用户 A 尝试写入用户 B 的行，断言被拒绝 |
| P9：仅限 Service Role 的表 | 生成 audit_log/webhook_event 行，以已认证或匿名角色查询，断言返回零行 |
| P10：视图唯一性 | 生成用户有 N 条有效订阅，查询视图，断言恰好返回一行 |
| P11：视图为空 | 生成用户只有已取消/已过期订阅，查询视图，断言返回零行 |
| P12：文件命名 | 对 supabase/migrations/ 中的任意文件，断言文件名匹配正则 |
| P13：IF NOT EXISTS | 对任意迁移文件，解析 SQL，断言每条 CREATE TABLE/INDEX 使用 IF NOT EXISTS |

### 测试配置

```ts
// vitest.config.ts（tests/integration/supabase-infrastructure）
// 使用 @supabase/supabase-js，service role key 指向本地栈
// SUPABASE_URL=http://localhost:54321
// SUPABASE_SERVICE_ROLE_KEY=<supabase start 输出的本地 service role key>
```

数据库行为属性测试（P2–P11）需要运行中的本地 Supabase 实例，
使用 service role 客户端绕过 RLS 设置测试数据，然后切换到用户范围客户端验证 RLS 行为。

### 运行测试

```bash
# 先启动本地 Supabase 栈
supabase start

# 应用迁移
supabase db push

# 运行集成测试 + 属性测试（单次运行，非监听模式）
pnpm vitest run tests/integration/supabase-infrastructure
```
