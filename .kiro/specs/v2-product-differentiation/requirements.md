# 需求文档

## 引言

本阶段为 AutoContent Pro v2.0 产品差异化能力，对应 TASKS.md 中的 M3 里程碑。

**目标**：在 v1.0 商业化基础上，引入自定义模板、批量异步处理、团队协作、开放 API 和浏览器插件五项差异化能力，使产品从个人工具升级为可团队协作、可对外集成的内容生产平台。

**依赖的前置阶段（均已完成）**：
- Phase 1 `autocontent-pro-mvp`：核心生成流程、IP 限流、基础内容审核
- Phase 2 `supabase-infrastructure`：数据库 schema、RLS、`audit_logs` 表
- Phase 3 `cloud-data-plan-foundation`：生成记录写入、使用统计、历史和使用 API
- Phase 4 `payments-monetization`：Lemon Squeezy checkout、webhook 处理、套餐能力校验
- Phase 5 `risk-control-launch-readiness`：双维度限流、审计日志、内容审核增强、集成测试、E2E 测试

**范围说明**：严格对应 TASKS.md M3 任务（TSK-M3-001、TSK-M3-002、TSK-M3-003、TSK-M3-010、TSK-M3-011、TSK-M3-012、TSK-M3-013），不扩展范围，不重新实现前置阶段已有功能。

---

## 范围重叠检查

以下内容属于前置阶段，本阶段不重复实现：

| 能力 | 所属阶段 |
|------|---------|
| 核心生成流程 `POST /api/generate` | Phase 1 |
| IP 限流与双维度限流 | Phase 1 / Phase 5 |
| 基础内容审核与关键词过滤 | Phase 1 / Phase 5 |
| Supabase Auth 认证与会话管理 | Phase 2 / Phase 3 |
| `profiles`、`plans`、`subscriptions`、`generations`、`usage_stats`、`audit_logs`、`webhook_events` 表 | Phase 2 |
| `getPlanCapability` 服务 | Phase 3 |
| 生成记录写入与使用统计 | Phase 3 |
| `GET /api/history`、`GET /api/usage` | Phase 3 |
| Lemon Squeezy checkout 与 webhook 处理 | Phase 4 |
| 套餐能力校验（平台数、月生成次数） | Phase 4 |
| 审计日志写入 | Phase 5 |
| `has_api_access`、`has_team_access` 字段 | Phase 2（`plans` 表） |

---

## 术语表

- **Template_Service**：`src/lib/templates/` 中负责模板 CRUD 的服务模块。
- **User_Template**：用户自定义的生成参数配置，存储于 `user_templates` 表，包含 `name`、`tone`、`length`、`custom_instructions`、`platform_overrides` 等字段。
- **Tone**：生成语气，枚举值为 `professional`（专业）、`casual`（轻松）、`humorous`（幽默）、`authoritative`（权威）、`empathetic`（共情）。
- **Batch_Job**：一次批量生成任务，存储于 `batch_jobs` 表，包含多个 `Batch_Job_Item`。
- **Batch_Job_Item**：批量任务中的单条内容项，存储于 `batch_job_items` 表。
- **Job_Status**：批量任务状态，枚举值为 `pending`（待处理）、`processing`（处理中）、`completed`（已完成）、`failed`（失败）、`partial`（部分成功）。
- **Queue_Service**：`src/lib/queue/` 中封装 QStash 的异步任务投递模块。
- **QStash**：Upstash 提供的 HTTP 消息队列服务，用于异步批量任务调度。
- **Team**：团队实体，存储于 `teams` 表，包含名称、Owner 和成员列表。
- **Team_Member**：团队成员关系，存储于 `team_members` 表，包含 `role` 字段（`owner`、`admin`、`member`）。
- **Team_Role**：团队成员角色，枚举值为 `owner`（所有者）、`admin`（管理员）、`member`（普通成员）。
- **Invitation**：团队邀请记录，存储于 `team_invitations` 表，包含邀请 token、被邀请邮箱和过期时间。
- **API_Key**：外部调用凭证，存储于 `api_keys` 表，格式为 `acp_` 前缀 + 随机字符串，仅在创建时明文返回一次。
- **External_API**：对外开放的生成接口 `POST /api/v1/generate`，使用 API_Key 认证，不依赖 Supabase 会话。
- **Key_Management_API**：API key 管理接口集合（`GET/POST/DELETE /api/keys`）。
- **Browser_Extension**：浏览器插件 PoC，可从目标页面抓取内容并调用 External_API 完成一键生成。
- **Generate_Route**：已有的 `POST /api/generate` 路由（前置阶段实现）。
- **Plan_Capability_Service**：已有的 `getPlanCapability(userId)` 函数（Phase 3 实现）。
- **Audit_Logger**：已有的 `src/lib/db/audit-logger.ts` 模块（Phase 5 实现）。
- **Rate_Limiter**：已有的 `src/lib/rate-limit/index.ts` 模块（Phase 5 实现）。

---

## 需求列表

### 需求 1：自定义模板 CRUD

**用户故事**：作为内容创作者，我希望能够创建、保存和复用自定义生成模板，以便在不同场景下快速应用一致的品牌风格和语气。

#### 验收标准

1. THE Template_Service SHALL 在 `user_templates` 表中存储模板，字段包括 `id`、`user_id`、`name`（最长 100 字符）、`tone`、`length`、`custom_instructions`（最长 2000 字符）、`platform_overrides`（JSONB）、`created_at`、`updated_at`。
2. WHEN 已认证用户发送有效的 `POST /api/templates` 请求，THE Template_Service SHALL 创建模板并返回 HTTP 201 及新建模板对象。
3. WHEN 已认证用户发送 `GET /api/templates` 请求，THE Template_Service SHALL 仅返回该用户自己的模板列表，按 `updated_at DESC` 排序。
4. WHEN 已认证用户发送有效的 `PUT /api/templates/:id` 请求，THE Template_Service SHALL 更新指定模板并返回 HTTP 200 及更新后的模板对象。
5. WHEN 已认证用户发送 `DELETE /api/templates/:id` 请求，THE Template_Service SHALL 删除指定模板并返回 HTTP 200。
6. IF 请求操作的模板 `id` 不属于当前用户，THEN THE Template_Service SHALL 返回 HTTP 404 及错误码 `NOT_FOUND`。
7. IF 请求体中 `tone` 字段不在枚举值 `{ professional, casual, humorous, authoritative, empathetic }` 内，THEN THE Template_Service SHALL 返回 HTTP 400 及错误码 `INVALID_INPUT`。
8. IF 请求体中 `name` 字段为空或超过 100 字符，THEN THE Template_Service SHALL 返回 HTTP 400 及错误码 `INVALID_INPUT`。
9. WHEN 未认证用户访问任意模板接口，THE Template_Service SHALL 返回 HTTP 401 及错误码 `UNAUTHORIZED`。
10. THE Template_Service SHALL 使用 Zod 对所有请求体进行校验，并以 `ApiSuccess<T>` / `ApiError` 格式返回响应。

---

### 需求 2：模板应用于生成

**用户故事**：作为内容创作者，我希望在生成文案时能够选择已保存的模板，以便自动应用模板中的语气和参数配置。

#### 验收标准

1. WHEN 已认证用户在 `POST /api/generate` 请求中传入有效的 `templateId`，THE Generate_Route SHALL 从 `user_templates` 表读取该模板，并将模板中的 `tone`、`length`、`custom_instructions` 合并到生成参数中。
2. WHEN 请求中同时传入 `templateId` 和显式的 `options.tone`，THE Generate_Route SHALL 以请求中的显式参数覆盖模板参数。
3. IF 传入的 `templateId` 不存在或不属于当前用户，THEN THE Generate_Route SHALL 返回 HTTP 404 及错误码 `NOT_FOUND`。
4. WHILE `templateId` 未传入，THE Generate_Route SHALL 使用现有默认参数逻辑，不受本需求影响。
5. THE Generate_Route SHALL 在模板读取失败时返回 HTTP 503 及错误码 `SERVICE_UNAVAILABLE`，不影响无模板的生成请求。

---

### 需求 3：批量任务创建与提交

**用户故事**：作为内容创作者，我希望一次提交多条内容进行批量生成，以便高效处理大量内容而无需逐条操作。

#### 验收标准

1. WHEN 已认证用户发送有效的 `POST /api/generate/batch` 请求，THE System SHALL 在 `batch_jobs` 表创建一条批量任务记录，并为请求中的每条内容在 `batch_job_items` 表创建对应的子任务记录。
2. THE System SHALL 要求批量请求中的内容条数在 1 到 50 条之间（含边界值）；IF 条数超出范围，THEN THE System SHALL 返回 HTTP 400 及错误码 `INVALID_INPUT`。
3. WHEN 批量任务创建成功，THE System SHALL 立即返回 HTTP 202 及 `{ jobId, itemCount, status: "pending" }`，不等待生成完成。
4. THE System SHALL 在创建批量任务时校验用户套餐是否具备批量处理权限（`has_batch_access`）；IF 用户无权限，THEN THE System SHALL 返回 HTTP 402 及错误码 `PLAN_LIMIT_REACHED`。
5. IF 请求体校验失败，THEN THE System SHALL 返回 HTTP 400 及错误码 `INVALID_INPUT`，不创建任何数据库记录。
6. THE System SHALL 使用 Zod 对 `POST /api/generate/batch` 请求体进行校验，所有响应遵循 `ApiSuccess<T>` / `ApiError` 格式。

---

### 需求 4：异步任务队列集成

**用户故事**：作为后端工程师，我希望批量任务通过异步队列执行，以便批量处理不阻塞主请求，并具备失败重试能力。

#### 验收标准

1. THE Queue_Service SHALL 封装 QStash HTTP API，位于 `src/lib/queue/index.ts`，并导出 `enqueueJob(jobId: string, payload: BatchJobPayload): Promise<void>` 函数。
2. WHEN 批量任务创建成功，THE System SHALL 调用 Queue_Service 将任务投递到 QStash 队列，投递失败不影响 HTTP 202 响应的返回，但 SHALL 记录结构化错误日志。
3. WHEN QStash 回调 `POST /api/jobs/callback` 时，THE System SHALL 处理单条 `Batch_Job_Item` 的生成，并更新对应记录的状态和结果。
4. THE System SHALL 对每条 `Batch_Job_Item` 最多重试 3 次；WHEN 重试次数耗尽仍失败，THE System SHALL 将该 item 状态设为 `failed` 并记录错误信息。
5. WHEN 一个 `Batch_Job` 的所有 items 均处理完毕，THE System SHALL 根据 items 的最终状态将 `Batch_Job` 状态更新为 `completed`（全部成功）、`partial`（部分成功）或 `failed`（全部失败）。
6. THE Queue_Service SHALL 仅在服务端使用 `QSTASH_TOKEN` 环境变量，不得在客户端代码中引用。
7. IF QStash 服务不可用，THEN THE Queue_Service SHALL 返回错误并由调用方记录日志，不抛出未捕获异常。

---

### 需求 5：批量任务状态查询

**用户故事**：作为内容创作者，我希望能够查询批量任务的执行进度和结果，以便了解任务完成情况并获取生成内容。

#### 验收标准

1. WHEN 已认证用户发送 `GET /api/jobs/:id` 请求，THE System SHALL 返回该任务的 `jobId`、`status`、`itemCount`、`completedCount`、`failedCount`、`createdAt`、`updatedAt`。
2. WHEN 任务状态为 `completed` 或 `partial`，THE System SHALL 在响应中包含 `items` 数组，每项包含 `itemId`、`status`、`results`（生成结果）。
3. IF 请求的 `jobId` 不存在或不属于当前用户，THEN THE System SHALL 返回 HTTP 404 及错误码 `NOT_FOUND`。
4. WHEN 未认证用户访问 `GET /api/jobs/:id`，THE System SHALL 返回 HTTP 401 及错误码 `UNAUTHORIZED`。
5. THE System SHALL 对 `GET /api/jobs/:id` 响应遵循 `ApiSuccess<T>` / `ApiError` 格式。

---

### 需求 6：团队数据模型

**用户故事**：作为团队管理员，我希望系统支持团队、成员和角色的数据模型，以便为团队协作功能提供数据基础。

#### 验收标准

1. THE System SHALL 在数据库中创建 `teams` 表，字段包括 `id`、`name`（最长 100 字符）、`owner_id`（引用 `auth.users`）、`plan_id`（引用 `plans`）、`created_at`、`updated_at`。
2. THE System SHALL 在数据库中创建 `team_members` 表，字段包括 `id`、`team_id`、`user_id`、`role`（枚举：`owner`、`admin`、`member`）、`joined_at`。
3. THE System SHALL 在数据库中创建 `team_invitations` 表，字段包括 `id`、`team_id`、`invited_email`、`invited_by`、`token`（唯一）、`role`、`expires_at`、`accepted_at`、`created_at`。
4. THE System SHALL 对 `teams` 和 `team_members` 表启用 RLS，确保用户只能读取自己所属团队的数据。
5. THE System SHALL 保证每个团队有且仅有一个 `owner` 角色成员；IF 尝试将团队的最后一个 `owner` 降级或移除，THEN THE System SHALL 返回错误。
6. THE System SHALL 在 `team_members(team_id, user_id)` 上建立唯一约束，防止同一用户重复加入同一团队。
7. THE System SHALL 在 `plans` 表的 `has_team_access` 字段为 `true` 时，允许该套餐用户创建和管理团队；IF 用户套餐 `has_team_access` 为 `false`，THEN THE System SHALL 返回 HTTP 402 及错误码 `PLAN_LIMIT_REACHED`。

---

### 需求 7：团队协作基础能力

**用户故事**：作为团队管理员，我希望能够邀请成员加入团队并共享历史记录和模板，以便团队成员协同创作内容。

#### 验收标准

1. WHEN 团队 `owner` 或 `admin` 发送 `POST /api/teams/:id/invitations` 请求，THE System SHALL 创建邀请记录并向被邀请邮箱发送包含邀请链接的邮件，邀请链接有效期为 7 天。
2. WHEN 被邀请用户访问邀请链接并接受邀请，THE System SHALL 在 `team_members` 表创建成员记录，并将 `team_invitations` 记录的 `accepted_at` 设为当前时间。
3. IF 邀请 token 已过期（`expires_at < NOW()`），THEN THE System SHALL 返回 HTTP 400 及错误码 `INVALID_INPUT`，不创建成员记录。
4. IF 被邀请用户已是该团队成员，THEN THE System SHALL 返回 HTTP 400 及错误码 `INVALID_INPUT`，不重复创建成员记录。
5. WHEN 团队成员访问 `GET /api/history`，THE System SHALL 支持通过 `teamId` 查询参数返回该团队所有成员的生成历史（需成员具备读取权限）。
6. WHEN 团队成员访问 `GET /api/templates`，THE System SHALL 支持通过 `teamId` 查询参数返回该团队共享的模板列表。
7. WHEN 团队 `owner` 发送 `DELETE /api/teams/:id/members/:userId` 请求，THE System SHALL 将指定成员从团队中移除。
8. IF 非 `owner` 或 `admin` 角色的成员尝试邀请他人或移除成员，THEN THE System SHALL 返回 HTTP 403 及错误码 `FORBIDDEN`。

---

### 需求 8：开放 API 设计

**用户故事**：作为开发者，我希望通过 API key 调用 AutoContent Pro 的生成接口，以便将内容生成能力集成到自己的应用中。

#### 验收标准

1. THE System SHALL 提供 `POST /api/keys` 接口，允许已认证且套餐 `has_api_access` 为 `true` 的用户创建 API key；创建时 SHALL 返回完整的 key 字符串（格式：`acp_` + 32 位随机字符），此后 SHALL 仅存储其哈希值，不再返回明文。
2. THE System SHALL 提供 `GET /api/keys` 接口，返回当前用户的 API key 列表（仅含 `id`、`name`、`prefix`、`createdAt`、`lastUsedAt`，不含明文 key）。
3. THE System SHALL 提供 `DELETE /api/keys/:id` 接口，允许用户撤销指定 API key；撤销后该 key 立即失效。
4. THE External_API `POST /api/v1/generate` SHALL 接受 `Authorization: Bearer <api_key>` 头部进行认证，不依赖 Supabase 会话 cookie。
5. WHEN External_API 收到有效 API key，THE System SHALL 验证 key 对应用户的套餐权限，并按与内部接口相同的逻辑执行生成。
6. IF API key 无效、已撤销或不存在，THEN THE External_API SHALL 返回 HTTP 401 及错误码 `UNAUTHORIZED`。
7. THE System SHALL 对 External_API 应用独立的限流策略：每个 API key 每分钟最多 10 次请求；WHEN 超限，THE System SHALL 返回 HTTP 429 及错误码 `RATE_LIMITED`。
8. WHEN External_API 成功处理请求，THE System SHALL 更新对应 API key 的 `last_used_at` 字段。
9. IF 用户套餐 `has_api_access` 为 `false`，THEN THE System SHALL 在 `POST /api/keys` 时返回 HTTP 402 及错误码 `PLAN_LIMIT_REACHED`。
10. THE System SHALL 在 `api_keys` 表中存储 `id`、`user_id`、`name`、`key_hash`、`key_prefix`（前 8 位）、`is_active`、`last_used_at`、`created_at`。

---

### 需求 9：浏览器插件 PoC

**用户故事**：作为内容创作者，我希望通过浏览器插件直接从目标页面抓取内容并一键生成文案，以便减少复制粘贴的操作步骤。

#### 验收标准

1. THE Browser_Extension SHALL 能够从目标页面（至少支持微信公众号文章页、知乎文章页）提取正文文本内容。
2. WHEN 用户在目标页面点击插件图标，THE Browser_Extension SHALL 展示一个弹出面板，显示已抓取的内容摘要和平台选择器。
3. WHEN 用户在弹出面板中点击生成按钮，THE Browser_Extension SHALL 调用 External_API `POST /api/v1/generate`，使用用户配置的 API key 进行认证。
4. WHEN External_API 返回生成结果，THE Browser_Extension SHALL 在弹出面板中展示各平台文案，并提供一键复制功能。
5. IF External_API 返回错误，THE Browser_Extension SHALL 在弹出面板中展示用户友好的错误提示，不暴露内部错误码。
6. THE Browser_Extension SHALL 在本地存储（`chrome.storage.local`）中保存用户的 API key 配置，不得将 API key 硬编码或上传到任何服务器。
7. THE Browser_Extension SHALL 以 Chrome Extension Manifest V3 规范开发，代码位于 `browser-extension/` 目录。
8. IF 目标页面无法提取到有效文本（内容为空或少于 50 字符），THE Browser_Extension SHALL 提示用户手动输入内容，不自动调用 External_API。

---

## 正确性属性（Correctness Properties）

### P1：模板所有权隔离

用户只能读取、修改和删除自己的模板，不能访问其他用户的模板。

- 对于所有用户 A 和用户 B（A ≠ B），用户 A 创建的模板 ID 在用户 B 的 `GET /api/templates` 响应中不得出现。
- 对于所有用户 A 尝试操作用户 B 的模板 ID，`PUT /api/templates/:id` 和 `DELETE /api/templates/:id` 必须返回 HTTP 404。

### P2：模板参数覆盖优先级

显式请求参数必须始终覆盖模板参数，模板参数必须覆盖系统默认参数。

- 对于所有包含 `templateId` 和显式 `options.tone` 的生成请求，实际使用的 `tone` 必须等于请求中的显式值，而非模板中的值。
- 对于所有仅包含 `templateId` 的生成请求，实际使用的 `tone` 必须等于模板中存储的值。

### P3：批量任务 items 数量不变量

批量任务创建后，`batch_job_items` 中的记录数必须等于请求中的内容条数。

- 对于所有包含 N 条内容（1 ≤ N ≤ 50）的批量请求，成功创建后 `batch_job_items` 中属于该 `jobId` 的记录数必须恰好等于 N。

### P4：批量任务状态机合法性

`Batch_Job` 和 `Batch_Job_Item` 的状态转换必须遵循合法路径。

- `Batch_Job_Item` 的状态转换路径为：`pending → processing → completed | failed`，不得出现逆向转换。
- `Batch_Job` 的最终状态必须由其所有 items 的最终状态决定：全部 `completed` → `completed`；全部 `failed` → `failed`；混合 → `partial`。
- 对于所有 `Batch_Job`，`completedCount + failedCount ≤ itemCount` 必须始终成立。

### P5：API Key 唯一性

生成的 API key 必须全局唯一，且格式符合规范。

- 对于任意两次 `POST /api/keys` 调用，返回的 key 字符串必须不同（无碰撞）。
- 对于所有生成的 key，必须满足正则 `^acp_[a-zA-Z0-9]{32}$`。
- 对于所有存储在 `api_keys` 表中的记录，`key_hash` 字段必须唯一。

### P6：API Key 撤销即时生效

撤销 API key 后，该 key 必须立即无法用于认证。

- 对于所有已通过 `DELETE /api/keys/:id` 撤销的 key，后续使用该 key 调用 `POST /api/v1/generate` 必须返回 HTTP 401。
- 撤销操作与后续请求之间不得存在缓存窗口导致已撤销 key 仍然有效。

### P7：团队成员 Owner 唯一性

每个团队有且仅有一个 `owner` 角色成员。

- 对于所有团队，`team_members` 表中 `role = 'owner'` 的记录数必须恰好为 1。
- 任何导致团队 `owner` 数量变为 0 或超过 1 的操作必须被拒绝并返回错误。

### P8：团队数据隔离

团队成员只能访问自己所属团队的共享数据，不能访问其他团队的数据。

- 对于所有用户 A（属于团队 T1）和团队 T2（A 不属于），使用 `teamId=T2` 查询历史记录或模板时，必须返回 HTTP 403 或空结果，不得返回 T2 的数据。

### P9：外部 API 限流一致性

External_API 的限流策略必须独立于内部接口，且对同一 API key 的计数必须单调递增直至重置。

- 对于任意 API key，在 1 分钟窗口内第 N 次请求（N ≤ 10）必须返回 HTTP 200；第 11 次及以后必须返回 HTTP 429。
- 窗口重置后，计数必须归零，下一次请求必须返回 HTTP 200。

### P10：邀请 Token 不可重用

已接受或已过期的邀请 token 不得被再次使用。

- 对于所有 `accepted_at IS NOT NULL` 的邀请记录，再次使用其 token 必须返回 HTTP 400 及错误码 `INVALID_INPUT`。
- 对于所有 `expires_at < NOW()` 的邀请记录，使用其 token 必须返回 HTTP 400 及错误码 `INVALID_INPUT`。
