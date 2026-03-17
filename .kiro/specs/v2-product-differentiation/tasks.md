# 实现计划：v2-product-differentiation

## 概述

本任务列表对应 AutoContent Pro v2.0 产品差异化能力（M3 里程碑），涵盖自定义模板、批量异步处理、团队协作、开放 API 和浏览器插件五项核心功能。实现顺序遵循依赖关系：数据库 → 模板 → 批量队列 → 团队 → 开放 API → 浏览器插件 → 属性测试。

## 任务列表

- [x] 1. 验证 v2 数据库 Migration
  - 确认 `supabase/migrations/20260316000000_v2_schema.sql` 已包含所有新增表：`user_templates`、`batch_jobs`、`batch_job_items`、`teams`、`team_members`、`team_invitations`、`api_keys`
  - 确认所有表的 RLS 策略已正确配置（见设计文档 3.2 节）
  - 确认 `batch_jobs` 表的 `completed_count + failed_count <= item_count` 约束存在
  - 确认 `team_members(team_id, user_id)` 唯一约束存在
  - 确认 `api_keys.key_hash` 唯一约束存在
  - _需求：6.1, 6.2, 6.3, 6.4, 6.6, 8.10_

- [x] 2. 实现自定义模板服务
  - [x] 2.1 创建 `src/lib/templates/service.ts`
    - 实现 `TemplateService` 接口：`create`、`list`、`getById`、`update`、`delete`
    - 使用 Supabase service role client 执行数据库操作
    - `list` 方法支持可选 `teamId` 参数，按 `updated_at DESC` 排序
    - `getById` 和 `update`、`delete` 方法校验 `user_id` 所有权，不匹配返回 `null`
    - 导出 `UserTemplate`、`CreateTemplateInput` 类型
    - _需求：1.1, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 2.2 为模板服务编写单元测试
    - 测试 CRUD 操作的正常路径
    - 测试所有权校验（跨用户操作返回 null）
    - 测试 `list` 方法的 `teamId` 过滤逻辑
    - _需求：1.3, 1.6_

  - [x] 2.3 实现模板管理 API 路由
    - 创建 `src/app/api/templates/route.ts`：处理 `POST`（创建）和 `GET`（列表）
    - 创建 `src/app/api/templates/[id]/route.ts`：处理 `PUT`（更新）和 `DELETE`（删除）
    - 使用 Zod 校验请求体：`name`（1-100 字符）、`tone`（枚举）、`length`（枚举）、`custom_instructions`（≤2000 字符）
    - 所有响应遵循 `ApiSuccess<T>` / `ApiError` 格式，携带 `requestId` 和 `timestamp`
    - 未认证返回 401 `UNAUTHORIZED`，所有权不匹配返回 404 `NOT_FOUND`
    - _需求：1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9, 1.10_

  - [ ]* 2.4 为模板 API 路由编写集成测试
    - 测试 `POST /api/templates`：创建成功（201）、无效 tone（400）、超长 name（400）、未认证（401）
    - 测试 `GET /api/templates`：仅返回当前用户模板、支持 teamId 参数
    - 测试 `PUT /api/templates/:id`：更新成功（200）、跨用户操作（404）
    - 测试 `DELETE /api/templates/:id`：删除成功（200）、跨用户操作（404）
    - _需求：1.2, 1.3, 1.4, 1.5, 1.6, 1.9_

  - [ ]* 2.5 编写属性测试：Property 1 - 模板所有权隔离
    - 文件：`tests/property/v2-product-differentiation.property.test.ts`（创建文件）
    - **Property 1：模板所有权隔离**
    - **验证：需求 1.3, 1.6**
    - 注释标签：`// Feature: v2-product-differentiation, Property 1: 模板所有权隔离`
    - 使用 fast-check，最少 100 次迭代
    - _需求：1.3, 1.6_

- [x] 3. 扩展生成接口支持模板
  - [x] 3.1 修改 `src/app/api/generate/route.ts` 支持 `templateId`
    - 在请求体 Zod schema 中新增可选字段 `templateId?: string`
    - 当 `templateId` 存在时，调用 `TemplateService.getById` 读取模板参数
    - 实现参数合并优先级：显式请求参数 > 模板参数 > 系统默认值
    - `templateId` 不存在或不属于当前用户时返回 404 `NOT_FOUND`
    - 模板读取 DB 异常时返回 503 `SERVICE_UNAVAILABLE`，不影响无模板的请求
    - _需求：2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.6 编写属性测试：Property 2 - 模板参数覆盖优先级
    - 追加到 `tests/property/v2-product-differentiation.property.test.ts`
    - **Property 2：模板参数覆盖优先级**
    - **验证：需求 2.1, 2.2**
    - 注释标签：`// Feature: v2-product-differentiation, Property 2: 模板参数覆盖优先级`
    - 使用 fast-check，最少 100 次迭代
    - _需求：2.1, 2.2_

- [x] 4. 检查点 - 确保模板相关测试全部通过
  - 确保所有测试通过，如有问题请向用户反馈。

- [x] 5. 实现异步任务队列服务
  - [x] 5.1 创建 `src/lib/queue/index.ts`
    - 实现 `QueueService` 接口，导出 `enqueueJob(jobId: string, payload: BatchJobPayload): Promise<void>`
    - 使用 `QSTASH_TOKEN` 环境变量（仅服务端），调用 QStash HTTP API
    - 回调 URL 格式：`${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/callback`
    - 每条 item 单独入队，配置 QStash 最多重试 3 次
    - 投递失败时记录结构化错误日志，不抛出未捕获异常，不影响调用方的 HTTP 响应
    - 导出 `BatchJobPayload` 类型：`{ jobId: string; itemId: string; retryCount: number }`
    - _需求：4.1, 4.2, 4.6, 4.7_

  - [ ]* 5.2 为队列服务编写单元测试
    - 测试 `enqueueJob` 正常调用 QStash API
    - 测试 QStash 不可用时不抛出异常，仅记录日志
    - Mock `QSTASH_TOKEN` 环境变量
    - _需求：4.1, 4.7_

- [x] 6. 实现批量生成接口
  - [x] 6.1 创建 `src/app/api/generate/batch/route.ts`
    - 使用 Zod 校验请求体：`items`（1-50 条，每条含 `content` 和 `platforms`）、可选 `templateId`
    - 校验用户套餐 `has_batch_access` 权限，无权限返回 402 `PLAN_LIMIT_REACHED`
    - 在 `batch_jobs` 表创建任务记录，在 `batch_job_items` 表为每条内容创建子任务记录
    - 调用 `QueueService.enqueueJob` 将每条 item 投递到 QStash（投递失败不影响 202 响应）
    - 立即返回 HTTP 202：`{ jobId, itemCount, status: "pending" }`
    - 请求体校验失败时返回 400，不创建任何数据库记录
    - _需求：3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 6.2 为批量生成接口编写集成测试
    - 测试有效批量请求（1 条、50 条边界值）返回 202
    - 测试超出 50 条返回 400 `INVALID_INPUT`
    - 测试无 `has_batch_access` 权限返回 402 `PLAN_LIMIT_REACHED`
    - 测试请求体校验失败不创建数据库记录
    - _需求：3.1, 3.2, 3.4, 3.5_

  - [ ]* 6.3 编写属性测试：Property 3 - 批量任务 items 数量不变量
    - 追加到 `tests/property/v2-product-differentiation.property.test.ts`
    - **Property 3：批量任务 items 数量不变量**
    - **验证：需求 3.1, 3.3**
    - 注释标签：`// Feature: v2-product-differentiation, Property 3: 批量任务 items 数量不变量`
    - 使用 fast-check，最少 100 次迭代
    - _需求：3.1, 3.3_

- [x] 7. 实现 QStash 回调处理与任务状态查询
  - [x] 7.1 创建 `src/app/api/jobs/callback/route.ts`
    - 验证 QStash 签名（使用 `QSTASH_CURRENT_SIGNING_KEY` 和 `QSTASH_NEXT_SIGNING_KEY`）
    - 解析请求体：`{ jobId, itemId, retryCount }`
    - 将 `batch_job_items` 状态更新为 `processing`，调用 AI 服务执行单条生成
    - 生成成功：更新 item 状态为 `completed`，写入 `results` 字段
    - 生成失败：更新 `retry_count`，若 `retry_count >= 3` 则设为 `failed` 并写入 `error_message`
    - 每次 item 状态变更后，聚合更新父 `batch_jobs` 的 `completed_count`、`failed_count` 和 `status`
    - 状态聚合规则：全部 `completed` → `completed`；全部 `failed` → `failed`；混合 → `partial`
    - 使用 service role client 执行数据库写操作（绕过 RLS）
    - 返回 HTTP 200（成功）或 HTTP 500（失败，触发 QStash 重试）
    - _需求：4.3, 4.4, 4.5_

  - [x] 7.2 创建 `src/app/api/jobs/[id]/route.ts`
    - 验证用户认证，未认证返回 401 `UNAUTHORIZED`
    - 查询 `batch_jobs` 表，校验 `user_id` 所有权，不匹配返回 404 `NOT_FOUND`
    - 返回：`jobId`、`status`、`itemCount`、`completedCount`、`failedCount`、`createdAt`、`updatedAt`
    - 当状态为 `completed` 或 `partial` 时，额外返回 `items` 数组（含 `itemId`、`status`、`results`）
    - 响应遵循 `ApiSuccess<BatchJobStatus>` 格式
    - _需求：5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 7.3 为任务状态查询编写集成测试
    - 测试 `GET /api/jobs/:id`：任务存在且属于当前用户（200）
    - 测试任务不属于当前用户（404）
    - 测试未认证访问（401）
    - 测试 `completed` 状态时响应包含 `items` 数组
    - _需求：5.1, 5.2, 5.3, 5.4_

  - [ ]* 7.4 编写属性测试：Property 4 - 批量任务状态机合法性
    - 追加到 `tests/property/v2-product-differentiation.property.test.ts`
    - **Property 4：批量任务状态机合法性**
    - **验证：需求 4.5**
    - 注释标签：`// Feature: v2-product-differentiation, Property 4: 批量任务状态机合法性`
    - 使用 fast-check，最少 100 次迭代
    - _需求：4.5_

- [x] 8. 检查点 - 确保批量任务相关测试全部通过
  - 确保所有测试通过，如有问题请向用户反馈。

- [x] 9. 实现团队数据服务
  - [x] 9.1 创建 `src/lib/teams/index.ts`
    - 实现 `TeamService` 接口：`create`、`listForUser`、`invite`、`acceptInvitation`、`removeMember`、`getMemberRole`
    - `create`：在 `teams` 表创建团队，同时在 `team_members` 表插入 owner 记录
    - `invite`：生成 64 位十六进制 token（`crypto.randomBytes(32).toString('hex')`），写入 `team_invitations`，有效期 7 天；通过 Resend SDK 发送邀请邮件，邮件发送失败不影响邀请记录创建，响应附加 `emailSent: false`
    - `acceptInvitation`：校验 token 未过期且未使用，在 `team_members` 插入记录，更新 `accepted_at`
    - `removeMember`：校验操作者为 owner，校验目标不是最后一个 owner，执行删除
    - `getMemberRole`：查询指定用户在指定团队的角色
    - 使用 Supabase service role client
    - _需求：6.1, 6.2, 6.3, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.7_

  - [ ]* 9.2 为团队服务编写单元测试
    - 测试 `create` 同时创建团队和 owner 成员记录
    - 测试 `acceptInvitation` 拒绝过期 token 和已使用 token
    - 测试 `removeMember` 拒绝移除最后一个 owner
    - _需求：6.5, 7.3, 7.4_

- [x] 10. 实现团队管理 API 路由
  - [x] 10.1 创建团队 CRUD 路由
    - 创建 `src/app/api/teams/route.ts`：处理 `POST`（创建团队）和 `GET`（获取用户所属团队列表）
    - `POST /api/teams`：校验 `has_team_access`，无权限返回 402 `PLAN_LIMIT_REACHED`；使用 Zod 校验 `name`（1-100 字符）
    - `GET /api/teams`：返回当前用户所属的所有团队
    - _需求：6.7, 7.8_

  - [x] 10.2 创建团队邀请路由
    - 创建 `src/app/api/teams/[id]/invitations/route.ts`：处理 `POST`（发送邀请）
    - 创建 `src/app/api/teams/[id]/invitations/accept/route.ts`：处理 `POST`（接受邀请）
    - 发送邀请：校验操作者角色为 `owner` 或 `admin`，否则返回 403 `FORBIDDEN`；使用 Zod 校验 `email` 和 `role`
    - 接受邀请：校验 token 有效性，已过期或已使用返回 400 `INVALID_INPUT`；被邀请用户已是成员返回 400 `INVALID_INPUT`
    - _需求：7.1, 7.2, 7.3, 7.4, 7.8_

  - [x] 10.3 创建团队成员管理路由
    - 创建 `src/app/api/teams/[id]/members/[userId]/route.ts`：处理 `DELETE`（移除成员）
    - 校验操作者为 `owner`，否则返回 403 `FORBIDDEN`
    - 校验目标用户存在于团队，否则返回 404 `NOT_FOUND`
    - _需求：7.7, 7.8_

  - [x] 10.4 扩展历史记录和模板接口支持 `teamId`
    - 修改 `src/app/api/history/route.ts`：支持 `teamId` 查询参数，校验请求用户是该团队成员，否则返回 403 `FORBIDDEN`
    - 修改 `src/app/api/templates/route.ts` 的 `GET` 处理：已在任务 2.3 中支持 `teamId`，此处确认团队成员权限校验逻辑正确
    - _需求：7.5, 7.6_

  - [ ]* 10.5 为团队 API 路由编写集成测试
    - 测试 `POST /api/teams`：创建成功（201）、无 `has_team_access` 权限（402）
    - 测试 `POST /api/teams/:id/invitations`：有效邀请（201）、非 admin 操作（403）
    - 测试 `POST /api/teams/:id/invitations/accept`：有效 token（200）、过期 token（400）、已使用 token（400）
    - 测试 `DELETE /api/teams/:id/members/:userId`：成功移除（200）、非 owner 操作（403）
    - _需求：6.7, 7.1, 7.2, 7.3, 7.7, 7.8_

  - [ ]* 10.6 编写属性测试：Property 7 - 团队 Owner 唯一性
    - 追加到 `tests/property/v2-product-differentiation.property.test.ts`
    - **Property 7：团队 Owner 唯一性**
    - **验证：需求 6.5**
    - 注释标签：`// Feature: v2-product-differentiation, Property 7: 团队 Owner 唯一性`
    - 使用 fast-check，最少 100 次迭代
    - _需求：6.5_

  - [ ]* 10.7 编写属性测试：Property 8 - 团队数据隔离
    - 追加到 `tests/property/v2-product-differentiation.property.test.ts`
    - **Property 8：团队数据隔离**
    - **验证：需求 6.4, 7.5, 7.6**
    - 注释标签：`// Feature: v2-product-differentiation, Property 8: 团队数据隔离`
    - 使用 fast-check，最少 100 次迭代
    - _需求：6.4, 7.5, 7.6_

  - [ ]* 10.8 编写属性测试：Property 10 - 邀请 Token 不可重用
    - 追加到 `tests/property/v2-product-differentiation.property.test.ts`
    - **Property 10：邀请 Token 不可重用**
    - **验证：需求 7.3, 7.4**
    - 注释标签：`// Feature: v2-product-differentiation, Property 10: 邀请 Token 不可重用`
    - 使用 fast-check，最少 100 次迭代
    - _需求：7.3, 7.4_

- [x] 11. 检查点 - 确保团队协作相关测试全部通过
  - 确保所有测试通过，如有问题请向用户反馈。

- [x] 12. 实现开放 API Key 服务
  - [x] 12.1 创建 `src/lib/api-keys/index.ts`
    - 实现 `ApiKeyService` 接口：`create`、`list`、`revoke`、`verify`、`recordUsage`
    - `create`：生成 `acp_` + `crypto.randomBytes(24).toString('base64url').slice(0, 32)`，计算 `SHA-256` hex 存入 `key_hash`，存储前 8 位为 `key_prefix`，明文 key 仅返回一次
    - `list`：返回 `id`、`name`、`prefix`、`createdAt`、`lastUsedAt`，不含明文 key
    - `revoke`：将 `is_active` 设为 `false`，立即生效
    - `verify`：对传入 key 计算 SHA-256，查询 `key_hash` 且 `is_active = true`，返回对应 `userId` 或 `null`
    - `recordUsage`：更新 `last_used_at` 为当前时间
    - _需求：8.1, 8.2, 8.3, 8.6, 8.8, 8.10_

  - [ ]* 12.2 为 API Key 服务编写单元测试
    - 测试生成的 key 格式匹配 `/^acp_[a-zA-Z0-9]{32}$/`
    - 测试 `verify` 对已撤销 key 返回 `null`
    - 测试 `verify` 对不存在 key 返回 `null`
    - _需求：8.1, 8.3, 8.6_

- [x] 13. 实现 API Key 管理路由与外部 API
  - [x] 13.1 创建 API Key 管理路由
    - 创建 `src/app/api/keys/route.ts`：处理 `POST`（创建）和 `GET`（列表）
    - 创建 `src/app/api/keys/[id]/route.ts`：处理 `DELETE`（撤销）
    - `POST /api/keys`：校验 `has_api_access`，无权限返回 402 `PLAN_LIMIT_REACHED`；使用 Zod 校验 `name`；响应包含明文 key（仅此一次）
    - `GET /api/keys`：返回 key 列表，不含明文
    - `DELETE /api/keys/:id`：校验所有权，不匹配返回 404 `NOT_FOUND`；撤销后立即生效
    - _需求：8.1, 8.2, 8.3, 8.9_

  - [x] 13.2 创建外部 API 路由 `src/app/api/v1/generate/route.ts`
    - 从 `Authorization: Bearer <api_key>` 请求头提取 key，不依赖 Supabase session cookie
    - 调用 `ApiKeyService.verify` 验证 key，无效或已撤销返回 401 `UNAUTHORIZED`
    - 应用独立限流：每个 API key 每分钟最多 10 次，使用 Upstash Redis 独立计数器（key 格式：`ratelimit:apikey:<keyId>`）
    - 超限返回 429 `RATE_LIMITED`
    - 验证通过后，复用内部生成逻辑执行生成，校验用户套餐权限
    - 成功后调用 `ApiKeyService.recordUsage` 更新 `last_used_at`
    - 请求体和响应格式与内部 `POST /api/generate` 相同
    - _需求：8.4, 8.5, 8.6, 8.7, 8.8_

  - [ ]* 13.3 为 API Key 路由和外部 API 编写集成测试
    - 测试 `POST /api/keys`：创建成功（201，验证 key 格式）、无 `has_api_access` 权限（402）
    - 测试 `DELETE /api/keys/:id`：撤销成功（200）、跨用户操作（404）
    - 测试 `POST /api/v1/generate`：有效 key（200）、已撤销 key（401）、无效 key（401）、超限（429）
    - _需求：8.1, 8.3, 8.4, 8.6, 8.7_

  - [ ]* 13.4 编写属性测试：Property 5 - API Key 唯一性与格式
    - 追加到 `tests/property/v2-product-differentiation.property.test.ts`
    - **Property 5：API Key 唯一性与格式**
    - **验证：需求 8.1**
    - 注释标签：`// Feature: v2-product-differentiation, Property 5: API Key 唯一性与格式`
    - 使用 fast-check，最少 100 次迭代
    - _需求：8.1_

  - [ ]* 13.5 编写属性测试：Property 6 - API Key 撤销即时生效
    - 追加到 `tests/property/v2-product-differentiation.property.test.ts`
    - **Property 6：API Key 撤销即时生效**
    - **验证：需求 8.3, 8.6**
    - 注释标签：`// Feature: v2-product-differentiation, Property 6: API Key 撤销即时生效`
    - 使用 fast-check，最少 100 次迭代
    - _需求：8.3, 8.6_

  - [ ]* 13.6 编写属性测试：Property 9 - 外部 API 限流一致性
    - 追加到 `tests/property/v2-product-differentiation.property.test.ts`
    - **Property 9：外部 API 限流一致性**
    - **验证：需求 8.7**
    - 注释标签：`// Feature: v2-product-differentiation, Property 9: 外部 API 限流一致性`
    - 使用 fast-check，最少 100 次迭代
    - _需求：8.7_

- [x] 14. 检查点 - 确保开放 API 相关测试全部通过
  - 确保所有测试通过，如有问题请向用户反馈。

- [x] 15. 实现浏览器插件 PoC
  - [x] 15.1 创建插件目录结构和配置文件
    - 创建 `browser-extension/manifest.json`（Chrome MV3）：声明 `content_scripts`（注入微信公众号和知乎页面）、`action`（popup）、`background.service_worker`、`permissions`（`storage`、`activeTab`）、`host_permissions`
    - 创建 `browser-extension/package.json`：配置 TypeScript 编译依赖
    - 创建 `browser-extension/tsconfig.json`：配置 TypeScript strict 模式
    - _需求：9.7_

  - [x] 15.2 实现内容提取器
    - 创建 `browser-extension/content/extractors/wechat.ts`：提取微信公众号文章正文（选择器：`#js_content`）
    - 创建 `browser-extension/content/extractors/zhihu.ts`：提取知乎文章正文（选择器：`.Post-RichTextContainer` 或 `.RichText`）
    - 创建 `browser-extension/content/content.ts`：根据当前页面 URL 选择对应提取器，提取内容后通过 `chrome.runtime.sendMessage` 发送给 popup
    - 内容少于 50 字符时发送空内容标志，由 popup 提示手动输入
    - _需求：9.1, 9.8_

  - [x] 15.3 实现存储工具和 API 调用封装
    - 创建 `browser-extension/utils/storage.ts`：封装 `chrome.storage.local` 的 API key 读写（`getApiKey`、`setApiKey`、`clearApiKey`），不上传到任何服务器
    - 创建 `browser-extension/utils/api.ts`：封装 `POST /api/v1/generate` 调用，使用 `Authorization: Bearer <api_key>` 头，处理 401/429 等错误，返回用户友好的错误信息（不暴露内部错误码）
    - _需求：9.3, 9.5, 9.6_

  - [x] 15.4 实现 popup 面板
    - 创建 `browser-extension/popup/popup.html`：包含内容摘要区域、平台选择器（支持 10 个平台）、生成按钮、结果展示区域、API key 配置入口
    - 创建 `browser-extension/popup/popup.ts`：监听 content script 消息获取抓取内容；内容少于 50 字符时禁用生成按钮并提示手动输入；点击生成时调用 `api.ts` 封装；展示各平台生成结果并提供一键复制按钮；展示用户友好的错误提示
    - 创建 `browser-extension/popup/popup.css`：基础样式
    - _需求：9.2, 9.4, 9.5, 9.8_

  - [x] 15.5 创建 MV3 Service Worker
    - 创建 `browser-extension/background/service-worker.ts`：处理插件安装事件，转发 content script 与 popup 之间的消息
    - _需求：9.7_

  - [ ]* 15.6 为内容提取器编写单元测试
    - 创建 `tests/unit/browser-extension/extractors.test.ts`
    - 测试微信公众号提取器：有效 DOM 结构返回正文、无目标元素返回空字符串
    - 测试知乎提取器：有效 DOM 结构返回正文、内容少于 50 字符时标记为无效
    - _需求：9.1, 9.8_

- [x] 16. 检查点 - 确保浏览器插件相关测试全部通过
  - 确保所有测试通过，如有问题请向用户反馈。

- [x] 17. 完善属性测试文件
  - [x] 17.1 确认属性测试文件完整性
    - 确认 `tests/property/v2-product-differentiation.property.test.ts` 包含全部 10 个属性测试（P1-P10）
    - 每个属性测试包含注释标签 `// Feature: v2-product-differentiation, Property N: <text>`
    - 每个属性测试最少运行 100 次迭代（`{ numRuns: 100 }`）
    - 确认 fast-check 已添加到项目依赖（`pnpm add -D fast-check`）
    - _需求：P1-P10 全部属性_

  - [ ]* 17.2 补充未在前序任务中创建的属性测试
    - 若 P1-P10 中有任何属性测试尚未在前序任务中追加，在此统一补充
    - 确保测试文件可独立运行：`pnpm vitest run tests/property/v2-product-differentiation.property.test.ts`
    - _需求：P1-P10_

- [x] 18. 新增环境变量配置
  - 在项目根目录 `.env.example` 中新增以下环境变量（若文件不存在则创建）：
    - `QSTASH_TOKEN=`
    - `QSTASH_CURRENT_SIGNING_KEY=`
    - `QSTASH_NEXT_SIGNING_KEY=`
    - `RESEND_API_KEY=`
  - 确认 `NEXT_PUBLIC_APP_URL` 已存在于 `.env.example`（QStash 回调 URL 依赖此变量）
  - _需求：4.6, 7.1_

- [x] 19. 最终检查点 - 确保所有测试通过
  - 运行完整测试套件，确保所有单元测试、集成测试和属性测试通过
  - 确保 TypeScript 编译无错误（`pnpm build`）
  - 确保 ESLint 无报错（`pnpm lint`）
  - 如有问题请向用户反馈。

## 备注

- 标有 `*` 的子任务为可选任务，可跳过以加快 MVP 交付
- 每个任务引用了具体的需求条款，确保可追溯性
- 检查点任务确保增量验证，避免问题积累
- 属性测试（P1-P10）验证系统的普遍正确性，单元测试验证具体示例和边界条件
- 所有 API 路由使用 `@/` 路径别名导入，遵循项目结构规范
- 数据库写操作（QStash 回调）使用 service role client 绕过 RLS
- 新增环境变量：`QSTASH_TOKEN`、`QSTASH_CURRENT_SIGNING_KEY`、`QSTASH_NEXT_SIGNING_KEY`、`RESEND_API_KEY`
