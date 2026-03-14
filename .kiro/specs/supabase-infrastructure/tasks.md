# 实施计划：supabase-infrastructure

## 概述

采用单迁移文件方案：所有 DDL、种子数据和 RLS 策略均位于
`supabase/migrations/20260313000000_initial_schema.sql`，包裹在 `BEGIN`/`COMMIT` 事务中。
测试使用 Vitest + fast-check 针对本地 Supabase 栈运行。

对应 TASKS.md：TSK-M2-001、TSK-M2-002、TSK-M2-003。

---

## 任务列表

- [x] 1. 初始化 Supabase CLI 项目与迁移框架
  - 运行 `supabase init` 在仓库根目录生成 `supabase/config.toml`
  - 创建 `supabase/migrations/` 目录
  - 创建空迁移文件 `supabase/migrations/20260313000000_initial_schema.sql`，
    包含 `BEGIN;` / `COMMIT;` 包裹和注释头
  - 验证 `supabase start` 能无错误地启动本地栈
  - _需求：1.1、2.1、2.4_

- [x] 2. 添加 pgcrypto 扩展和 set_updated_at 触发器函数
  - 在迁移文件中添加 `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
  - 添加 `CREATE OR REPLACE FUNCTION public.set_updated_at()` 触发器函数
    （在 BEFORE UPDATE 时将 `NEW.updated_at = now()`）
  - _需求：1.5、2.5_

- [x] 3. 创建 profiles 表和触发器
  - 添加 `CREATE TABLE IF NOT EXISTS public.profiles`，列定义与 schema.sql 一致：
    `id UUID 主键 外键→auth.users ON DELETE CASCADE`、`display_name`、`avatar_url`、
    `default_tone`、`default_language NOT NULL DEFAULT 'zh-CN'`、`created_at`、`updated_at`
    （所有时间戳使用 TIMESTAMPTZ）
  - 挂载 `trg_profiles_updated_at` BEFORE UPDATE 触发器，调用 `set_updated_at()`
  - _需求：3.1、3.2、3.3_

- [x] 4. 创建 plans 表、触发器和种子数据
  - 添加 `CREATE TABLE IF NOT EXISTS public.plans`，列定义与 schema.sql 一致，
    包含 `CHECK (price_cents >= 0)` 和
    `CHECK (speed_tier IN ('standard','fast','priority','dedicated'))`
  - 挂载 `trg_plans_updated_at` BEFORE UPDATE 触发器
  - 添加四条 `INSERT … ON CONFLICT (code) DO UPDATE` 种子行：
    `free`（0，限制 30，3 个平台，standard），
    `creator`（2900，无限制，10 个平台，fast），
    `studio`（7900，无限制，10 个平台，priority），
    `enterprise`（19900，无限制，无限制平台，dedicated）
    ——严格匹配 schema.sql 中的规范值
  - _需求：4.1、4.2、4.3、4.4、4.5_

- [x] 5. 创建 subscriptions 表和索引
  - 添加 `CREATE TABLE IF NOT EXISTS public.subscriptions`，列定义与 schema.sql 一致，
    包含 `CHECK (status IN ('active','cancelled','expired','past_due','trialing','paused'))`
    以及外键 `auth.users ON DELETE CASCADE` 和外键 `plans(id)`
  - 添加 `CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_subscription_id`
    on `(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL`
  - 添加 `CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id` 和 `idx_subscriptions_status`
  - 挂载 `trg_subscriptions_updated_at` BEFORE UPDATE 触发器
  - _需求：5.1、5.2、5.3、5.4、5.5、5.6_

- [x] 6. 创建 generations 表和索引
  - 添加 `CREATE TABLE IF NOT EXISTS public.generations`，列定义与 schema.sql 一致，
    包含 `CHECK (input_source IN ('manual','extract'))`、
    `CHECK (status IN ('success','failed','partial'))`、
    `CHECK (platform_count >= 1)` 以及 token/duration 列的数值 CHECK
  - 外键 `auth.users ON DELETE SET NULL`（user_id 可为空）
  - 添加 `CREATE INDEX IF NOT EXISTS`：`idx_generations_user_id`、
    `idx_generations_created_at`（DESC）、`idx_generations_status`
  - _需求：6.1、6.2、6.3、6.4、6.5_

- [x] 7. 创建 usage_stats 表和触发器
  - 添加 `CREATE TABLE IF NOT EXISTS public.usage_stats`，列定义与 schema.sql 一致：
    `user_id UUID 主键 外键→auth.users ON DELETE CASCADE`、`current_month CHAR(7)`、
    `monthly_generation_count`、`total_generation_count`（均 CHECK >= 0）、
    `last_generation_at`、`updated_at`
  - 挂载 `trg_usage_stats_updated_at` BEFORE UPDATE 触发器
  - _需求：7.1、7.2、7.3_

- [x] 8. 创建 audit_logs 表和索引
  - 添加 `CREATE TABLE IF NOT EXISTS public.audit_logs`，列定义与 schema.sql 一致：
    `id`、`user_id`（可为空外键 ON DELETE SET NULL）、`action`、`resource_type`、
    `resource_id`、`ip_address INET`、`user_agent`、`metadata JSONB`、`created_at`
  - 无 `updated_at` 列——只追加
  - 添加 `CREATE INDEX IF NOT EXISTS`：`idx_audit_logs_action`、
    `idx_audit_logs_created_at`（DESC）、`idx_audit_logs_user_id`
  - _需求：8.1、8.2、8.3_

- [x] 9. 创建 webhook_events 表
  - 添加 `CREATE TABLE IF NOT EXISTS public.webhook_events`，列定义与 schema.sql 一致：
    `id`、`provider`、`event_name`、`event_id`、`processed_at`、`payload JSONB`、`created_at`
  - 添加 `UNIQUE (provider, event_id)` 约束
  - _需求：9.1、9.2、9.3_

- [x] 10. 创建 current_active_subscriptions 视图
  - 添加 `CREATE OR REPLACE VIEW public.current_active_subscriptions`，
    使用 `DISTINCT ON (s.user_id)` 关联 `subscriptions` 和 `plans`，
    过滤 `status IN ('active','trialing','past_due','paused')`，
    按 `s.user_id, s.updated_at DESC` 排序
  - 暴露列：`id`、`user_id`、`plan_id`、`plan_code`、`plan_display_name`、
    `status`、`current_period_start`、`current_period_end`、`updated_at`
  - _需求：10.1、10.2、10.3_

- [x] 11. 启用 RLS 并为 profiles、subscriptions、generations、usage_stats 添加策略
  - 对全部六张表执行 `ALTER TABLE … ENABLE ROW LEVEL SECURITY`
  - profiles：`profiles_select_own`（SELECT USING auth.uid()=id）、
    `profiles_insert_own`（INSERT WITH CHECK auth.uid()=id）、
    `profiles_update_own`（UPDATE USING auth.uid()=id）
  - subscriptions：`subscriptions_select_own`（SELECT USING auth.uid()=user_id）——无 INSERT/UPDATE 策略
  - generations：`generations_select_own`（SELECT）、`generations_insert_own`（INSERT WITH CHECK auth.uid()=user_id）
  - usage_stats：`usage_stats_select_own`（SELECT）、`usage_stats_update_own`（UPDATE USING auth.uid()=user_id）
  - 使用 `DROP POLICY IF EXISTS … ; CREATE POLICY …` 模式保证幂等性
  - audit_logs 和 webhook_events：启用 RLS，不定义任何宽松策略
  - _需求：11.1–11.5、12.1–12.4、13.1–13.4、14.1–14.4、15.1–15.5_

- [x] 12. 将迁移应用到本地环境并验证 Schema
  - 对本地栈运行 `supabase db push`
  - 确认 `public` 模式中存在全部七张表
  - 确认 `current_active_subscriptions` 视图存在
  - 确认 `plans` 恰好有四行（free、creator、studio、enterprise）
  - 通过 `pg_tables.rowsecurity` 确认六张表均启用 RLS
  - 通过 `pg_policies` 确认 `audit_logs` 和 `webhook_events` 上无宽松策略
  - 第二次运行迁移，确认无错误（幂等性检查）
  - _需求：1.1、1.3、16.1、16.3、16.4、16.5、16.6、16.7_

- [x] 13. 搭建 supabase-infrastructure 的 Vitest 集成测试套件
  - 创建 `tests/integration/supabase-infrastructure/` 目录
  - 创建 `vitest.config.ts`（或扩展根配置），指向本地 Supabase 栈：
    `SUPABASE_URL=http://localhost:54321`，service role key 来自 `supabase start` 输出
  - 安装 `fast-check` 为开发依赖：`pnpm add -D fast-check`
  - 创建 `helpers.ts`，包含 service role 客户端工厂和用户范围客户端工厂
  - _需求：16.1、16.2_

- [x] 14. 编写 Schema 结构和种子数据的集成测试
  - 创建 `tests/integration/supabase-infrastructure/schema.test.ts`
  - 测试：`public` 模式中存在全部七张表
  - 测试：`current_active_subscriptions` 视图存在
  - 测试：`plans` 包含恰好四行，code 为 `free`、`creator`、`studio`、`enterprise`
  - 测试：`pgcrypto` 扩展存在于 `pg_extension` 中
  - 测试：`audit_logs` 无 `updated_at` 列
  - 测试：六张表均启用 RLS（`pg_tables.rowsecurity = true`）
  - 测试：`audit_logs` 和 `webhook_events` 上无宽松策略（`pg_policies`）
  - _需求：16.3、16.4、16.5、16.6_

- [x] 15. 编写约束和幂等性的集成测试
  - 创建 `tests/integration/supabase-infrastructure/constraints.test.ts`
  - 测试：`webhook_events` 唯一约束拒绝重复 `(provider, event_id)`
  - 测试：`subscriptions` 部分唯一索引拒绝非空的重复 `provider_subscription_id`
  - 测试：重新运行迁移 SQL 无错误（幂等性）
  - 测试：`supabase/migrations/` 中的迁移文件名匹配 `^[0-9]{14}_[a-z0-9_]+\.sql$`
  - 测试：迁移文件中每条 `CREATE TABLE` 和 `CREATE INDEX` 包含 `IF NOT EXISTS`
  - _需求：2.2、2.3、5.3、9.2、16.7_

- [x] 16. 编写属性测试 — P1：迁移幂等性
  - 文件：`tests/integration/supabase-infrastructure/properties/p1-migration-idempotency.test.ts`
  - `// Feature: supabase-infrastructure, Property 1: Migration Idempotency`
  - 使用 fast-check 生成任意重新应用尝试；断言第二次应用后 Schema 状态相同且无 SQL 错误抛出
  - _需求：2.2、4.5、16.7_

- [x] 17. 编写属性测试 — P2：set_updated_at 触发器
  - 文件：`tests/integration/supabase-infrastructure/properties/p2-set-updated-at.test.ts`
  - `// Feature: supabase-infrastructure, Property 2: set_updated_at Trigger Fires on Every Update`
  - 对 `profiles`、`plans`、`subscriptions`、`usage_stats` 各表：使用 fast-check 生成随机字段值，
    插入行，记录 `updated_at`，执行 UPDATE，断言新 `updated_at >= 旧 updated_at`
  - _需求：2.5、3.2、4.3、5.5、7.2_

- [x] 18. 编写属性测试 — P3：CHECK 约束拒绝无效枚举值
  - 文件：`tests/integration/supabase-infrastructure/properties/p3-check-constraints.test.ts`
  - `// Feature: supabase-infrastructure, Property 3: CHECK Constraints Reject Out-of-Range Enum Values`
  - 对 `plans.speed_tier`、`subscriptions.status`、`generations.input_source`、`generations.status`：
    使用 fast-check 生成不在允许集合中的任意字符串，断言每次 INSERT 被 Postgres 错误码 `23514` 拒绝
  - _需求：4.2、5.2、6.2、6.3_

- [x] 19. 编写属性测试 — P4：级联删除传播到关联表
  - 文件：`tests/integration/supabase-infrastructure/properties/p4-cascade-delete.test.ts`
  - `// Feature: supabase-infrastructure, Property 4: Cascade Delete Propagates to Owned Tables`
  - 使用 fast-check 生成随机用户 ID；在 `profiles`、`subscriptions`、`usage_stats` 中为该用户插入行；
    删除 `auth.users` 记录；断言所有关联行消失
  - _需求：3.3、5.6、7.3_

- [x] 20. 编写属性测试 — P5：用户删除时 SET NULL 保留分析记录
  - 文件：`tests/integration/supabase-infrastructure/properties/p5-set-null-on-delete.test.ts`
  - `// Feature: supabase-infrastructure, Property 5: SET NULL on User Deletion Preserves Analytics Records`
  - 使用 fast-check 生成有 `generations` 和 `audit_logs` 行的随机用户；
    删除用户；断言行仍存在且 `user_id = NULL`
  - _需求：6.5_

- [x] 21. 编写属性测试 — P6：已认证用户的 RLS 行隔离
  - 文件：`tests/integration/supabase-infrastructure/properties/p6-rls-row-isolation.test.ts`
  - `// Feature: supabase-infrastructure, Property 6: RLS Row Isolation for Authenticated Users`
  - 使用 fast-check 生成两个不同用户 ID；通过 service role 为两者插入行；
    以用户 A 查询每张表；断言结果只包含用户 A 的行，不含用户 B 的行
  - 覆盖：`profiles`、`subscriptions`、`generations`、`usage_stats`
  - _需求：11.2、12.2、13.2、14.2_

- [x] 22. 编写属性测试 — P7：RLS 匿名隔离
  - 文件：`tests/integration/supabase-infrastructure/properties/p7-rls-anon-isolation.test.ts`
  - `// Feature: supabase-infrastructure, Property 7: RLS Anon Isolation`
  - 使用 fast-check 生成任意行数；通过 service role 插入行；
    以匿名角色查询 `profiles`、`subscriptions`、`generations`、`usage_stats`；断言返回零行
  - _需求：11.5、12.4、13.4、14.4_

- [x] 23. 编写属性测试 — P8：已认证用户的 RLS 写入隔离
  - 文件：`tests/integration/supabase-infrastructure/properties/p8-rls-write-isolation.test.ts`
  - `// Feature: supabase-infrastructure, Property 8: RLS Write Isolation for Authenticated Users`
  - 使用 fast-check 生成用户 A 和 B；以用户 A 尝试 INSERT/UPDATE 用户 B 拥有的行；
    断言操作被拒绝（权限拒绝或零行受影响）
  - 覆盖：`profiles`（INSERT/UPDATE）、`generations`（INSERT）、`usage_stats`（UPDATE）
  - _需求：11.3、11.4、12.3、13.3、14.3_

- [x] 24. 编写属性测试 — P9：仅限 Service Role 的表对非 Service Role 会话不可见
  - 文件：`tests/integration/supabase-infrastructure/properties/p9-service-only-tables.test.ts`
  - `// Feature: supabase-infrastructure, Property 9: Service-Only Tables Are Invisible to Non-Service-Role Sessions`
  - 使用 fast-check 生成任意行数；通过 service role 向 `audit_logs` 和 `webhook_events` 插入行；
    以已认证用户和匿名角色查询；断言返回零行
  - _需求：15.3、15.4_

- [x] 25. 编写属性测试 — P10：current_active_subscriptions 每用户最多返回一行
  - 文件：`tests/integration/supabase-infrastructure/properties/p10-view-uniqueness.test.ts`
  - `// Feature: supabase-infrastructure, Property 10: current_active_subscriptions Returns At Most One Row Per User`
  - 使用 fast-check 生成有 N（1–10）条有效状态订阅且 `updated_at` 各不相同的用户；
    查询视图；断言恰好返回一行，且为 `updated_at` 最新的那条
  - _需求：10.1_

- [x] 26. 编写属性测试 — P11：current_active_subscriptions 对非活跃用户返回零行
  - 文件：`tests/integration/supabase-infrastructure/properties/p11-view-empty.test.ts`
  - `// Feature: supabase-infrastructure, Property 11: current_active_subscriptions Returns Zero Rows for Inactive Users`
  - 使用 fast-check 生成只有 `cancelled` 或 `expired` 订阅或完全没有订阅的用户；
    查询视图；断言对这些用户返回零行
  - _需求：10.3_

- [x] 27. 编写属性测试 — P12：迁移文件命名规范
  - 文件：`tests/integration/supabase-infrastructure/properties/p12-file-naming.test.ts`
  - `// Feature: supabase-infrastructure, Property 12: Migration File Naming Convention`
  - 使用 Node `fs` 读取 `supabase/migrations/` 中的所有文件；
    使用 fast-check 验证每个文件名匹配 `^[0-9]{14}_[a-z0-9_]+\.sql$`
  - _需求：2.1_

- [x] 28. 编写属性测试 — P13：所有 DDL 使用 IF NOT EXISTS 保护
  - 文件：`tests/integration/supabase-infrastructure/properties/p13-if-not-exists.test.ts`
  - `// Feature: supabase-infrastructure, Property 13: All DDL Uses IF NOT EXISTS Guards`
  - 读取每个迁移文件；解析 SQL 文本；使用 fast-check 断言每条
    `CREATE TABLE`、`CREATE INDEX` 和 `CREATE UNIQUE INDEX` 语句包含 `IF NOT EXISTS` 限定符
  - _需求：2.3_

- [x] 29. 检查点——针对本地栈运行完整测试套件
  - 运行 `supabase start`，然后 `supabase db push`，然后 `pnpm vitest run tests/integration/supabase-infrastructure`
  - 确保所有集成测试和全部 13 个属性测试通过
  - 如有疑问，在继续 Staging 验证前询问用户

- [ ] 30. 将迁移应用到 Staging 环境并验证
  - 将 Supabase CLI 关联到 Staging 项目：`supabase link --project-ref <staging-ref>`
  - 对 Staging 项目运行 `supabase db push --linked`
  - 针对 Staging 数据库重新执行任务 12 中的同一验证清单
  - 再次运行 `supabase db push --linked` 确认迁移在 Staging 上的幂等性
  - _需求：1.2、16.2_

---

## 备注

- 标有 `*` 的任务为可选项，可跳过以加快 MVP 进度
- 每个任务引用具体需求编号以便追溯
- 属性测试（任务 16–28）需要运行中的本地 Supabase 栈
- 所有 SQL 必须使用 `IF NOT EXISTS` 保护并包裹在 `BEGIN`/`COMMIT` 中
- `plans` 表不需要 RLS——它是无用户专属行的只读参考数据
- 测试设置使用 service role 客户端；验证 RLS 行为时切换到用户范围客户端
- 使用 `pnpm vitest run` 运行测试（非监听模式）
