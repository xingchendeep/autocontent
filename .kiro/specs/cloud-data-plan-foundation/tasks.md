# 实现计划：cloud-data-plan-foundation

## 概述

本阶段在已有的 Supabase 基础设施和用户认证之上，构建云端数据层与套餐能力读取服务。
实现顺序遵循依赖关系：先建立底层服务（Service_Role_Client、Generation_Writer、upsertUsageStats、Plan_Capability_Service），
再实现 API 路由，最后实现 Dashboard UI 组件，并在各层添加测试。

## 任务

- [x] 1. 创建 Service_Role_Client
  - [x] 1.1 在 `src/lib/db/client.ts` 中实现 `createServiceRoleClient` 函数
    - 使用 `SUPABASE_SERVICE_ROLE_KEY` 初始化 Supabase 客户端，绕过 RLS
    - 仅用于服务端写操作，永不暴露给客户端
    - _需求：1.1、2.1、7.6_

- [x] 2. 实现 PlanCapability 类型定义
  - [x] 2.1 在 `src/types/index.ts` 中新增 `PlanCapability` 接口
    - 包含字段：`planCode`、`displayName`、`maxPlatforms`（`number | null`）、`monthlyGenerationLimit`（`number | null`）、`canUseHistory`、`canUseApi`、`canUseTeam`、`speedTier`
    - _需求：7.5_

- [x] 3. 实现 Generation_Writer 核心逻辑
  - [x] 3.1 在 `src/lib/db/generation-writer.ts` 中实现 `resolveStatus` 函数
    - 全部成功（`errors` 为空）→ `'success'`
    - 部分成功（`results` 和 `errors` 均非空）→ `'partial'`
    - 全部失败（`results` 为空）→ `'failed'`
    - _需求：1.2、1.3、1.4_
  - [ ]* 3.2 为 `resolveStatus` 编写单元测试
    - 测试三种分支：全成功、部分失败、全失败
    - _需求：1.2、1.3、1.4_
  - [ ]* 3.3 为 `resolveStatus` 编写属性测试（P2）
    - **属性 P2：status 字段映射**
    - **验证需求：1.2、1.3、1.4**
    - 使用 fast-check 随机生成 `results`/`errors` 组合，验证映射规则
    - 标签：`// Feature: cloud-data-plan-foundation, Property P2: status 字段映射`
  - [x] 3.4 在 `src/lib/db/generation-writer.ts` 中实现 `writeGeneration` 函数
    - 接受 `WriteGenerationParams`（`userId`、`requestId`、`content`、`platforms`、`source`、`result`、`promptVersion`）
    - 若 `userId` 为空立即返回（匿名用户跳过）
    - 调用 `resolveStatus` 计算状态，构建 `GenerationRecord` 字段映射（含 `tokensInput`/`tokensOutput` 求和、`errorCode`/`errorMessage` 处理）
    - 使用 `createServiceRoleClient()` 插入 `generations` 表
    - 插入成功后调用 `upsertUsageStats(userId, requestId)`
    - 任何步骤失败均记录结构化错误日志（含 `requestId`、`userId`、`errorCode`），不抛出异常
    - 函数签名返回 `void`（非 `Promise<void>`），调用方不 await
    - _需求：1.1、1.2、1.3、1.4、1.5、1.6、1.7、8.1、8.4_
  - [ ]* 3.5 为 `writeGeneration` 匿名用户跳过逻辑编写单元测试
    - 验证 `userId` 为 null/空字符串时不调用数据库
    - _需求：1.7_
  - [ ]* 3.6 为匿名用户不写入编写属性测试（P3）
    - **属性 P3：匿名用户不写入**
    - **验证需求：1.7**
    - 使用 fast-check 随机生成结果 + null/空 userId，验证不触发数据库调用
    - 标签：`// Feature: cloud-data-plan-foundation, Property P3: 匿名用户不写入`

- [x] 4. 实现 upsertUsageStats
  - [x] 4.1 在 `src/lib/db/usage-stats.ts` 中实现 `upsertUsageStats` 函数
    - 读取当前月份字符串（`YYYY-MM` 格式）
    - 查询 `usage_stats` 中该用户的现有行
    - 若不存在：插入新行，`monthly_generation_count=1`，`total_generation_count=1`，`current_month=当前月份`
    - 若存在且 `current_month` 一致：递增 `monthly_generation_count` 和 `total_generation_count`
    - 若存在但 `current_month` 不一致（跨月）：重置 `monthly_generation_count=1`，递增 `total_generation_count`，更新 `current_month`
    - 所有路径均更新 `last_generation_at = now()`
    - 使用 `createServiceRoleClient()`，失败时记录日志但不抛出异常
    - _需求：2.1、2.2、2.3、2.4、2.5_
  - [ ]* 4.2 为 `upsertUsageStats` 计数器递增编写属性测试（P5）
    - **属性 P5：usage_stats 计数器递增**
    - **验证需求：2.1、2.2、2.3**
    - 使用 fast-check 随机用户 + 随机调用次数，验证计数器单调递增
    - 标签：`// Feature: cloud-data-plan-foundation, Property P5: usage_stats 计数器递增`
  - [ ]* 4.3 为跨月重置逻辑编写属性测试（P6）
    - **属性 P6：月份切换重置月度计数**
    - **验证需求：2.4**
    - 使用 fast-check 随机历史月份字符串，验证跨月后 `monthly_generation_count` 重置为 1，`total_generation_count` 继续递增
    - 标签：`// Feature: cloud-data-plan-foundation, Property P6: 月份切换重置月度计数`

- [x] 5. 检查点 - 确保数据层单元测试全部通过
  - 确保所有测试通过，如有问题请向用户反馈。

- [x] 6. 实现 Plan_Capability_Service
  - [x] 6.1 在 `src/lib/billing/plan-capability.ts` 中实现 `getPlanCapability` 函数
    - 使用 `createServiceRoleClient()` 查询 `current_active_subscriptions` 视图，过滤 `user_id = userId`
    - 若存在有效订阅行，从视图中读取关联套餐字段，构建 `PlanCapability` 对象
    - 若不存在，查询 `plans` 表中 `code = 'free'` 的行，构建 `PlanCapability` 对象
    - 将数据库字段映射为 `PlanCapability`：`platform_limit → maxPlatforms`、`monthly_generation_limit → monthlyGenerationLimit`、`has_history → canUseHistory`、`has_api_access → canUseApi`、`has_team_access → canUseTeam`、`speed_tier → speedTier`
    - 数据库错误直接抛出，不静默吞掉
    - _需求：7.1、7.2、7.3、7.4、7.5、7.6、7.7、7.8_
  - [ ]* 6.2 为 `getPlanCapability` 编写单元测试
    - 测试有订阅路径和无订阅（回退 free）路径
    - _需求：7.3、7.4_
  - [ ]* 6.3 为 PlanCapability 字段完整性编写属性测试（P16）
    - **属性 P16：PlanCapability 字段完整性**
    - **验证需求：7.1、7.3、7.4、7.5**
    - 使用 fast-check 随机 plans 行数据，验证所有字段均存在且映射正确
    - 标签：`// Feature: cloud-data-plan-foundation, Property P16: PlanCapability 字段完整性`

- [x] 7. 修改 POST /api/generate 路由，集成 fire-and-forget 写入
  - [x] 7.1 在 `src/app/api/generate/route.ts` 中集成 `writeGeneration` 调用
    - 在路由顶部调用 `getSession()` 获取当前用户（已认证则有 `userId`，匿名则为 null）
    - 在 AI 生成完成、向客户端发送响应之前，以 fire-and-forget 方式调用 `writeGeneration`（不 await）
    - 传入 `userId`（可为 null）、`requestId`、`content`、`platforms`、`source`、`result`
    - 确保写入失败不影响已返回的 HTTP 200 响应
    - _需求：1.1、8.1、8.2_
  - [ ]* 7.2 为写入失败不影响生成响应编写属性测试（P4）
    - **属性 P4：写入失败不影响生成响应**
    - **验证需求：1.6、8.2**
    - 模拟数据库错误，验证路由仍返回 HTTP 200 及生成结果
    - 标签：`// Feature: cloud-data-plan-foundation, Property P4: 写入失败不影响生成响应`

- [x] 8. 实现 GET /api/history 路由
  - [x] 8.1 创建 `src/app/api/history/route.ts`，实现 `GET` 处理函数
    - 调用 `getSession()` → 未认证返回 401 及错误码 `UNAUTHORIZED`
    - 使用 Zod 解析并验证查询参数：`page`（默认 1，最小 1）、`limit`（默认 20，最大 100）、`platform`（可选）、`status`（可选，枚举 `success/failed/partial`）
    - 非法参数返回 400 及错误码 `INVALID_INPUT`
    - 使用 Supabase 服务端客户端（携带用户 session，RLS 自动过滤 `user_id`）查询 `generations` 表
    - 查询字段：`id, input_source, platforms, platform_count, status, model_name, duration_ms, created_at`（不含 `input_content`、`result_json`）
    - 排序：`created_at DESC`；分页：`range((page-1)*limit, page*limit-1)`
    - 同时执行 count 查询获取 `total`，计算 `hasMore`
    - 返回 `ApiSuccess<{ items: HistorySummaryItem[], pagination: { page, limit, total, hasMore } }>`，含 `requestId` 和 `timestamp`
    - _需求：3.1、3.2、3.3、3.4、3.5、3.6、3.7、3.8_
  - [ ]* 8.2 为 GET /api/history 未认证返回 401 编写单元测试
    - _需求：3.5_
  - [ ]* 8.3 为非法分页参数返回 400 编写单元测试
    - 测试 `page=0`、`page=-1`、`limit=0`、`limit=101`、`limit=abc` 等情况
    - _需求：3.6_
  - [ ]* 8.4 为历史记录数据隔离与排序编写属性测试（P8）
    - **属性 P8：历史记录数据隔离与排序**
    - **验证需求：3.1、3.7、3.8**
    - 使用 fast-check 随机两用户 + 随机记录集合，验证用户间记录互不相交，且列表按 `created_at DESC` 排序
    - 标签：`// Feature: cloud-data-plan-foundation, Property P8: 历史记录数据隔离与排序`
  - [ ]* 8.5 为摘要字段安全编写属性测试（P9）
    - **属性 P9：历史记录摘要字段安全**
    - **验证需求：3.4**
    - 使用 fast-check 随机 generations 记录，验证响应列表项不含 `input_content` 或 `result_json`
    - 标签：`// Feature: cloud-data-plan-foundation, Property P9: 历史记录摘要字段安全`
  - [ ]* 8.6 为分页参数约束编写属性测试（P10）
    - **属性 P10：分页参数约束**
    - **验证需求：3.2、3.3**
    - 使用 fast-check 随机合法 `page`/`limit` + 随机记录数，验证 `items.length ≤ limit` 且 `hasMore` 计算正确
    - 标签：`// Feature: cloud-data-plan-foundation, Property P10: 分页参数约束`
  - [ ]* 8.7 为非法参数返回 400 编写属性测试（P11）
    - **属性 P11：非法分页参数返回 400**
    - **验证需求：3.6**
    - 使用 fast-check 随机非正整数 `page` 或超过 100 的 `limit`，验证返回 HTTP 400 及 `INVALID_INPUT`
    - 标签：`// Feature: cloud-data-plan-foundation, Property P11: 非法分页参数返回 400`

- [x] 9. 实现 GET /api/usage 路由
  - [x] 9.1 创建 `src/app/api/usage/route.ts`，实现 `GET` 处理函数
    - 调用 `getSession()` → 未认证返回 401 及错误码 `UNAUTHORIZED`
    - 并行查询：使用 Supabase 服务端客户端查询 `usage_stats`（RLS 过滤）+ 调用 `getPlanCapability(userId)`
    - 若 `usage_stats` 无记录，返回零值默认对象（`monthlyGenerationCount: 0`、`totalGenerationCount: 0`、`lastGenerationAt: null`、`currentMonth` 为当前月份）
    - 返回 `ApiSuccess<UsageData>`，含 `requestId` 和 `timestamp`
    - `getPlanCapability` 失败时返回 500
    - _需求：5.1、5.2、5.3、5.4、5.5_
  - [ ]* 9.2 为 GET /api/usage 未认证返回 401 编写单元测试
    - _需求：5.4_
  - [ ]* 9.3 为无 usage_stats 记录时返回零值编写单元测试
    - _需求：5.3_
  - [ ]* 9.4 为 usage 响应完整性编写属性测试（P13）
    - **属性 P13：usage 响应完整性**
    - **验证需求：5.1、5.2、5.5**
    - 使用 fast-check 随机 UsageData，验证响应 `data` 包含所有必需字段，且顶层含 `requestId` 和 `timestamp`
    - 标签：`// Feature: cloud-data-plan-foundation, Property P13: usage 响应完整性`

- [x] 10. 检查点 - 确保 API 路由单元测试全部通过
  - 确保所有测试通过，如有问题请向用户反馈。

- [x] 11. 实现 HistoryItem 组件
  - [x] 11.1 创建 `src/components/dashboard/HistoryItem.tsx`
    - 接受 `HistorySummaryItem` 作为 props
    - 展示：生成时间（`createdAt`，格式化为本地时间）、平台标签列表（`platforms`）、状态徽章（`status`：成功/部分失败/失败，使用不同颜色区分）、生成耗时（`durationMs`，格式化为秒）
    - _需求：4.2_
  - [ ]* 11.2 为 `HistoryItem` 列表项渲染完整性编写属性测试（P12）
    - **属性 P12：历史记录列表项渲染完整性**
    - **验证需求：4.2**
    - 使用 fast-check 随机 `HistorySummaryItem` 数据，验证渲染后 DOM 包含 `createdAt`、`platforms`、`status`、`durationMs` 的可见文本
    - 标签：`// Feature: cloud-data-plan-foundation, Property P12: 列表项渲染完整性`

- [x] 12. 实现 UsageCard 组件
  - [x] 12.1 创建 `src/components/dashboard/UsageCard.tsx`（客户端组件）
    - 组件挂载后调用 `GET /api/usage`，使用 `useState` + `useEffect` 管理加载/错误/数据状态
    - 加载中：展示骨架屏占位（`SkeletonCard`），不渲染空白区域
    - 错误状态：展示独立错误提示（`ErrorBanner`），不影响 Dashboard 其他区域
    - 正常状态：展示套餐名称（`displayName`）、速度等级徽章（`speedTier`）、本月生成次数（`monthlyGenerationCount`）
    - 若 `monthlyGenerationLimit` 不为 null：展示进度条及数值对比（"已用 / 限额 次"）
    - 若 `monthlyGenerationLimit` 为 null：显示"无限制"文本
    - _需求：6.1、6.2、6.3、6.4、6.5_
  - [ ]* 12.2 为 `UsageCard` 渲染完整性编写属性测试（P14）
    - **属性 P14：UsageCard 渲染完整性**
    - **验证需求：6.1、6.2**
    - 使用 fast-check 随机 `UsageData`，验证渲染后 DOM 包含 `displayName`、`speedTier`、`monthlyGenerationCount` 的可见文本
    - 标签：`// Feature: cloud-data-plan-foundation, Property P14: UsageCard 渲染完整性`
  - [ ]* 12.3 为有限额/无限额渲染编写属性测试（P15）
    - **属性 P15：UsageCard 有限额时显示进度**
    - **验证需求：6.3**
    - 使用 fast-check 随机有限额（`monthlyGenerationLimit` 不为 null）和无限额数据，验证对应渲染分支
    - 标签：`// Feature: cloud-data-plan-foundation, Property P15: 有限额时显示进度`
  - [ ]* 12.4 为 `UsageCard` 加载状态和错误状态编写单元测试
    - 测试加载中显示骨架屏、API 失败显示错误提示
    - _需求：6.4、6.5_

- [x] 13. 实现 Dashboard 历史记录页
  - [x] 13.1 创建 `src/app/dashboard/history/page.tsx`（服务端组件）
    - 通过 Middleware 保护（未认证自动重定向至 `/login`）
    - 调用 `GET /api/history`（通过 fetch 或直接调用 db 层）获取历史记录
    - 渲染 `HistoryItem` 列表
    - 支持分页浏览（上一页/下一页按钮，当前页码/总页数显示）
    - `items.length === 0` 时渲染空状态提示，引导用户前往首页生成（含链接）
    - _需求：4.1、4.2、4.3、4.4_
  - [x] 13.2 创建 `src/app/dashboard/history/loading.tsx`
    - 使用 React Suspense 骨架屏，展示加载状态指示器
    - _需求：4.6_
  - [x] 13.3 创建 `src/app/dashboard/history/error.tsx`（客户端组件）
    - 使用 Next.js error boundary，展示错误提示信息，不渲染空白页面
    - _需求：4.5_

- [x] 14. 在 Dashboard 首页集成 UsageCard
  - [x] 14.1 在 Dashboard 首页（`src/app/dashboard/page.tsx`）中引入并渲染 `UsageCard` 组件
    - `UsageCard` 独立加载，不阻塞 Dashboard 其他区域渲染
    - _需求：6.1、6.5_

- [-] 15. 配置集成测试并实现端到端写入测试
  - [x] 15.1 创建 `tests/integration/cloud-data-plan-foundation/vitest.config.ts`
    - 参照 `tests/integration/auth/vitest.config.ts` 配置，设置 `environment: 'node'`、`testTimeout: 30000`
    - 加载 `.env.local` 中的 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_ANON_KEY`
  - [x] 15.2 创建 `tests/integration/cloud-data-plan-foundation/helpers.ts`
    - 提供测试辅助函数：创建测试用户、清理测试数据（`generations`、`usage_stats` 表）
  - [ ]* 15.3 实现 `writeGeneration` 端到端写入集成测试
    - 测试已认证用户写入后 `generations` 表存在对应记录（属性 P1：写入记录完整性）
    - 测试 `usage_stats` 计数器正确递增
    - 测试 `usage_stats` 写入失败不回滚 `generations` 记录（属性 P7）
    - _需求：1.1、1.5、2.1、2.5、8.3_
  - [ ]* 15.4 实现 `getPlanCapability` 集成测试
    - 测试有效订阅路径和无订阅回退 free 套餐路径
    - _需求：7.3、7.4_

- [x] 16. 最终检查点 - 确保所有测试通过
  - 确保所有单元测试、属性测试、集成测试全部通过，如有问题请向用户反馈。

## 备注

- 标有 `*` 的子任务为可选测试任务，可在快速 MVP 迭代时跳过
- 每个任务均引用具体需求条款，确保可追溯性
- 属性测试使用 fast-check，每个属性最少运行 100 次迭代
- 集成测试需要真实 Supabase 测试实例（本地 `supabase start` 或测试环境）
- `writeGeneration` 为 fire-and-forget，调用方不 await，确保不阻塞 API 响应
- Service_Role_Client 仅用于服务端，永不暴露给客户端代码
