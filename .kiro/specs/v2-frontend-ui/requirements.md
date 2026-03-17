# 需求文档

## 引言

本阶段为 AutoContent Pro v2.0 前端 UI 实现，为已完成的 v2 后端五项差异化功能（自定义模板、批量异步处理、团队协作、开放 API、浏览器插件）构建完整的前端页面和交互组件。

**目标**：让用户能够通过 Web 界面使用 v2 全部功能，包括模板管理与应用、批量任务提交与进度查看、团队创建与成员管理、API Key 管理（已有基础组件，需增强）、以及浏览器插件文档页。

**依赖的后端阶段**：
- v2-product-differentiation：自定义模板 CRUD API、批量生成 API、团队协作 API、API Key 管理 API、外部 API、浏览器插件

**范围说明**：仅涉及前端页面、组件、hooks 和客户端状态管理。不修改后端 API 路由或数据库 schema。所有数据通过已有的后端 API 获取和提交。

---

## 术语表

- **Dashboard_Layout**：`src/app/dashboard/layout.tsx` 中的仪表盘布局组件，包含顶部导航栏。
- **Template_Selector**：生成页面中的模板选择下拉组件，允许用户选择已保存的模板并自动填充生成参数。
- **Template_Manager**：模板管理页面组件，提供模板的创建、编辑、删除功能。
- **Batch_Panel**：批量生成页面组件，提供多条内容的输入、提交和进度查看功能。
- **Team_Panel**：团队管理页面组件，提供团队创建、成员列表、邀请和移除功能。
- **Invitation_Accept_Page**：邀请接受页面，用户通过邀请链接访问后确认加入团队。
- **API_Keys_Panel**：已有的 API Key 管理组件（`src/components/dashboard/ApiKeysPanel.tsx`）。
- **Extension_Page**：浏览器插件文档与下载页面。
- **Toast**：轻量级操作反馈提示组件，用于显示成功、错误等短暂消息。
- **Skeleton**：骨架屏加载占位组件，在数据加载期间显示。
- **Empty_State**：空状态占位组件，在列表无数据时显示引导信息。

---

## 需求列表

### 需求 1：仪表盘导航扩展

**用户故事**：作为已登录用户，我希望在仪表盘导航栏中看到 v2 新功能的入口，以便快速访问模板管理、批量生成、团队协作等功能。

#### 验收标准

1. THE Dashboard_Layout SHALL 在顶部导航栏中新增以下导航项：「模板」（链接到 `/dashboard/templates`）、「批量生成」（链接到 `/dashboard/batch`）、「团队」（链接到 `/dashboard/teams`）、「插件」（链接到 `/dashboard/extension`）。
2. THE Dashboard_Layout SHALL 对当前激活的导航项应用视觉高亮样式（如文字颜色加深），使用户能够识别当前所在页面。
3. THE Dashboard_Layout SHALL 在移动端视口（宽度 < 768px）下将导航项折叠为汉堡菜单或水平滚动布局，确保所有导航项可访问。
4. THE Dashboard_Layout SHALL 保留现有的「控制台」「生成记录」「脚本库」「API Keys」「订阅」导航项，新增项不影响已有功能。

---

### 需求 2：自定义模板管理页面

**用户故事**：作为内容创作者，我希望在仪表盘中管理我的自定义模板，以便创建、编辑和删除生成参数配置。

#### 验收标准

1. WHEN 已认证用户访问 `/dashboard/templates` 页面，THE Template_Manager SHALL 调用 `GET /api/templates` 获取用户的模板列表并展示。
2. THE Template_Manager SHALL 以卡片列表形式展示每个模板，显示模板名称、语气（tone 的中文标签）、长度、自定义指令摘要（前 80 字符）和更新时间。
3. WHEN 用户点击「新建模板」按钮，THE Template_Manager SHALL 展示模板创建表单，包含以下字段：名称（必填，最长 100 字符）、语气（下拉选择：专业/轻松/幽默/权威/共情）、长度（下拉选择：短/中/长，默认中）、自定义指令（可选，最长 2000 字符）。
4. WHEN 用户提交有效的模板创建表单，THE Template_Manager SHALL 调用 `POST /api/templates` 创建模板，成功后将新模板添加到列表顶部并显示成功提示。
5. WHEN 用户点击模板卡片上的「编辑」按钮，THE Template_Manager SHALL 展示预填充当前值的编辑表单。
6. WHEN 用户提交有效的模板编辑表单，THE Template_Manager SHALL 调用 `PUT /api/templates/:id` 更新模板，成功后刷新该模板的显示内容并显示成功提示。
7. WHEN 用户点击模板卡片上的「删除」按钮，THE Template_Manager SHALL 展示确认对话框；用户确认后调用 `DELETE /api/templates/:id` 删除模板，成功后从列表中移除该模板。
8. IF `POST /api/templates` 或 `PUT /api/templates/:id` 返回 HTTP 400（`INVALID_INPUT`），THEN THE Template_Manager SHALL 在表单中显示对应字段的校验错误信息。
9. WHILE 模板列表正在加载，THE Template_Manager SHALL 显示骨架屏占位。
10. WHILE 模板列表为空，THE Template_Manager SHALL 显示空状态引导，包含「创建第一个模板」的行动按钮。
11. THE Template_Manager SHALL 使用 Zod 在客户端对表单输入进行预校验，在提交前拦截无效输入。

---

### 需求 3：模板选择器集成到生成流程

**用户故事**：作为内容创作者，我希望在生成文案时能够选择已保存的模板，以便自动应用模板中的语气和参数配置。

#### 验收标准

1. WHEN 已认证用户访问首页生成界面，THE Template_Selector SHALL 在平台选择器上方显示一个模板下拉选择器，列出用户的所有模板（调用 `GET /api/templates`）。
2. WHEN 用户选择一个模板，THE Template_Selector SHALL 将模板的 `tone` 和 `length` 值显示为当前选中的生成参数标签（如「语气：专业 · 长度：中」）。
3. WHEN 用户选择模板后点击生成按钮，THE System SHALL 在 `POST /api/generate` 请求体中附带 `templateId` 字段。
4. WHEN 用户未选择任何模板（选择「不使用模板」选项），THE System SHALL 不在请求体中附带 `templateId` 字段，使用默认参数。
5. WHILE 用户未登录，THE Template_Selector SHALL 不显示，生成流程保持现有行为不变。
6. WHILE 模板列表正在加载，THE Template_Selector SHALL 显示加载状态（如 spinner 或 "加载模板中…" 文字）。
7. IF 模板列表加载失败，THEN THE Template_Selector SHALL 显示「模板加载失败」提示，但不阻塞生成流程，用户仍可不选模板直接生成。

---

### 需求 4：批量生成页面

**用户故事**：作为内容创作者，我希望通过批量生成页面一次提交多条内容进行生成，以便高效处理大量内容。

#### 验收标准

1. WHEN 已认证用户访问 `/dashboard/batch` 页面，THE Batch_Panel SHALL 显示批量生成表单，包含内容输入区域和平台选择器。
2. THE Batch_Panel SHALL 提供「添加内容」按钮，允许用户逐条添加内容项，每条内容项包含一个文本输入框和一个删除按钮。
3. THE Batch_Panel SHALL 限制内容项数量在 1 到 50 条之间；WHEN 已达 50 条，THE Batch_Panel SHALL 禁用「添加内容」按钮并显示上限提示。
4. THE Batch_Panel SHALL 提供统一的平台选择器（复用 `PlatformSelector` 组件），所选平台应用于所有内容项。
5. THE Batch_Panel SHALL 提供可选的模板选择器（复用 Template_Selector 逻辑），所选模板应用于整个批量任务。
6. WHEN 用户点击「提交批量任务」按钮，THE Batch_Panel SHALL 调用 `POST /api/generate/batch` 提交任务，请求体包含 `items`（每项含 `content` 和 `platforms`）和可选的 `templateId`。
7. WHEN `POST /api/generate/batch` 返回 HTTP 202，THE Batch_Panel SHALL 显示任务已提交的成功提示，包含任务 ID，并自动跳转到任务详情视图。
8. IF `POST /api/generate/batch` 返回 HTTP 400（`INVALID_INPUT`），THEN THE Batch_Panel SHALL 显示具体的校验错误信息。
9. IF `POST /api/generate/batch` 返回 HTTP 402（`PLAN_LIMIT_REACHED`），THEN THE Batch_Panel SHALL 显示套餐升级提示，包含跳转到订阅页面的链接。
10. THE Batch_Panel SHALL 使用 Zod 在客户端对输入进行预校验：每条内容不为空、内容条数在 1-50 范围内、至少选择一个平台。

---

### 需求 5：批量任务进度与结果查看

**用户故事**：作为内容创作者，我希望查看批量任务的执行进度和生成结果，以便了解任务完成情况并获取生成内容。

#### 验收标准

1. WHEN 用户从批量生成页面提交任务后或访问任务详情，THE Batch_Panel SHALL 调用 `GET /api/jobs/:id` 获取任务状态并展示。
2. THE Batch_Panel SHALL 显示任务的整体进度信息：状态标签（待处理/处理中/已完成/失败/部分成功）、总条数、已完成条数、失败条数。
3. THE Batch_Panel SHALL 以进度条形式可视化展示任务完成比例（`completedCount / itemCount`）。
4. WHILE 任务状态为 `pending` 或 `processing`，THE Batch_Panel SHALL 每 5 秒自动轮询 `GET /api/jobs/:id` 更新进度显示。
5. WHEN 任务状态变为 `completed`、`partial` 或 `failed`，THE Batch_Panel SHALL 停止轮询并展示每条内容项的结果列表。
6. THE Batch_Panel SHALL 对每条结果项显示：序号、状态标签（成功/失败）、生成结果（成功时展示各平台文案，可展开/折叠）、错误信息（失败时显示）。
7. THE Batch_Panel SHALL 为每条成功的结果项提供「复制」按钮，允许用户复制单条平台文案。
8. WHILE 任务详情正在加载，THE Batch_Panel SHALL 显示骨架屏占位。
9. IF `GET /api/jobs/:id` 返回 HTTP 404，THEN THE Batch_Panel SHALL 显示「任务不存在」的错误提示。

---

### 需求 6：团队管理页面

**用户故事**：作为团队管理员，我希望在仪表盘中管理我的团队，以便创建团队、查看成员列表和邀请新成员。

#### 验收标准

1. WHEN 已认证用户访问 `/dashboard/teams` 页面，THE Team_Panel SHALL 调用 `GET /api/teams` 获取用户所属的团队列表并展示。
2. THE Team_Panel SHALL 以卡片形式展示每个团队，显示团队名称、用户在该团队的角色、成员数量。
3. WHEN 用户点击「创建团队」按钮，THE Team_Panel SHALL 展示团队创建表单，包含团队名称字段（必填，最长 100 字符）。
4. WHEN 用户提交有效的团队创建表单，THE Team_Panel SHALL 调用 `POST /api/teams` 创建团队，成功后将新团队添加到列表并显示成功提示。
5. IF `POST /api/teams` 返回 HTTP 402（`PLAN_LIMIT_REACHED`），THEN THE Team_Panel SHALL 显示套餐升级提示，说明当前套餐不支持团队功能，并提供跳转到订阅页面的链接。
6. WHEN 用户点击某个团队卡片，THE Team_Panel SHALL 展示该团队的详情视图，包含成员列表和邀请功能。
7. THE Team_Panel SHALL 在团队详情视图中以表格形式展示成员列表，每行显示：成员邮箱、角色标签（所有者/管理员/成员）、加入时间。
8. WHILE 团队列表或成员列表正在加载，THE Team_Panel SHALL 显示骨架屏占位。
9. WHILE 用户未加入任何团队，THE Team_Panel SHALL 显示空状态引导，包含「创建团队」的行动按钮。
10. THE Team_Panel SHALL 使用 Zod 在客户端对团队名称进行预校验。

---

### 需求 7：团队邀请与成员管理

**用户故事**：作为团队所有者或管理员，我希望能够邀请新成员加入团队并管理现有成员，以便团队协同创作内容。

#### 验收标准

1. WHEN 团队 `owner` 或 `admin` 在团队详情视图中点击「邀请成员」按钮，THE Team_Panel SHALL 展示邀请表单，包含被邀请人邮箱（必填）和角色选择（管理员/成员，默认成员）。
2. WHEN 用户提交有效的邀请表单，THE Team_Panel SHALL 调用 `POST /api/teams/:id/invitations` 发送邀请，成功后显示「邀请已发送」提示。
3. IF `POST /api/teams/:id/invitations` 返回 HTTP 403（`FORBIDDEN`），THEN THE Team_Panel SHALL 显示「无权限执行此操作」的错误提示。
4. IF `POST /api/teams/:id/invitations` 返回 HTTP 400（`INVALID_INPUT`），THEN THE Team_Panel SHALL 显示具体的校验错误信息（如邮箱格式无效、用户已是成员）。
5. WHEN 团队 `owner` 在成员列表中点击某个非 owner 成员的「移除」按钮，THE Team_Panel SHALL 展示确认对话框；用户确认后调用 `DELETE /api/teams/:id/members/:userId` 移除成员。
6. IF 当前用户角色为 `member`，THEN THE Team_Panel SHALL 隐藏「邀请成员」按钮和成员列表中的「移除」按钮。
7. IF 当前用户角色为 `admin`，THEN THE Team_Panel SHALL 显示「邀请成员」按钮但隐藏成员列表中的「移除」按钮（仅 owner 可移除）。
8. THE Team_Panel SHALL 使用 Zod 在客户端对邀请邮箱进行格式校验。

---

### 需求 8：团队邀请接受页面

**用户故事**：作为被邀请的用户，我希望通过邀请链接加入团队，以便开始与团队成员协作。

#### 验收标准

1. WHEN 用户访问 `/teams/accept?token=xxx` 页面，THE Invitation_Accept_Page SHALL 显示邀请信息（团队名称、邀请角色）和「接受邀请」按钮。
2. WHEN 已认证用户点击「接受邀请」按钮，THE Invitation_Accept_Page SHALL 调用 `POST /api/teams/:id/invitations/accept` 接受邀请，成功后跳转到 `/dashboard/teams` 页面并显示成功提示。
3. WHILE 用户未登录，THE Invitation_Accept_Page SHALL 显示提示信息「请先登录后再接受邀请」，并提供跳转到登录页面的链接（登录后自动重定向回邀请页面）。
4. IF 邀请 token 已过期或已被使用，THEN THE Invitation_Accept_Page SHALL 显示「邀请已失效」的错误提示，不显示「接受邀请」按钮。
5. IF 接受邀请请求返回 HTTP 400，THEN THE Invitation_Accept_Page SHALL 显示具体的错误信息（如 token 过期、已是成员）。

---

### 需求 9：API Keys 页面增强

**用户故事**：作为开发者，我希望 API Keys 管理页面提供更完善的使用指引，以便快速了解如何使用 Open API。

#### 验收标准

1. THE API_Keys_Panel SHALL 在页面顶部显示 Open API 使用说明区域，包含：API 端点地址（`POST /api/v1/generate`）、认证方式说明（`Authorization: Bearer <api_key>`）、限流说明（每个 Key 每分钟 10 次请求）。
2. THE API_Keys_Panel SHALL 提供一个可折叠的「请求示例」代码块，展示使用 `curl` 调用 Open API 的完整示例。
3. THE API_Keys_Panel SHALL 保留现有的 Key 创建、列表展示和撤销功能不变。
4. IF 用户套餐不支持 API 访问（`has_api_access` 为 `false`），THEN THE API_Keys_Panel SHALL 在创建表单位置显示套餐升级提示，禁用创建功能，但仍显示已有 Key 列表。

---

### 需求 10：浏览器插件文档页面

**用户故事**：作为内容创作者，我希望在仪表盘中了解浏览器插件的功能和安装方式，以便开始使用一键生成功能。

#### 验收标准

1. WHEN 已认证用户访问 `/dashboard/extension` 页面，THE Extension_Page SHALL 显示浏览器插件的功能介绍，包含：支持的页面类型（微信公众号、知乎文章）、核心功能描述（一键抓取内容并生成多平台文案）、使用前提（需要有效的 API Key）。
2. THE Extension_Page SHALL 提供安装指引步骤，说明如何以开发者模式加载未打包的 Chrome 扩展。
3. THE Extension_Page SHALL 提供一个「前往 API Keys 管理」的链接按钮，方便用户创建或查看 API Key。
4. THE Extension_Page SHALL 展示插件使用流程的简要说明（配置 API Key → 访问目标页面 → 点击插件图标 → 选择平台 → 生成文案 → 复制使用）。

---

### 需求 11：全局 UI 基础设施

**用户故事**：作为用户，我希望在执行操作后获得即时的视觉反馈，以便了解操作是否成功。

#### 验收标准

1. THE System SHALL 提供一个全局 Toast 通知组件，支持 `success`、`error`、`info` 三种类型，显示在页面右上角，3 秒后自动消失。
2. THE System SHALL 提供一个 `useToast` hook，允许任意组件触发 Toast 通知，接口为 `toast({ type, message })`。
3. THE System SHALL 提供一个通用的 Skeleton 骨架屏组件，支持自定义行数和宽度，用于列表和卡片的加载状态。
4. THE System SHALL 提供一个通用的 Empty_State 组件，接受 `title`、`description` 和可选的 `action`（按钮文字和点击回调）属性。
5. THE System SHALL 提供一个通用的确认对话框组件（`ConfirmDialog`），接受 `title`、`message`、`onConfirm`、`onCancel` 属性，用于删除和移除等危险操作的二次确认。
6. THE Toast 组件 SHALL 支持键盘操作（Escape 键关闭）和屏幕阅读器可访问（使用 `role="alert"` 和 `aria-live="polite"`）。

---

### 需求 12：团队上下文切换

**用户故事**：作为团队成员，我希望在仪表盘中切换个人视图和团队视图，以便查看团队共享的生成记录和模板。

#### 验收标准

1. WHEN 用户属于至少一个团队，THE Dashboard_Layout SHALL 在导航栏中显示一个上下文切换器（下拉菜单），选项包含「个人」和用户所属的各团队名称。
2. WHEN 用户选择某个团队上下文，THE System SHALL 将 `teamId` 查询参数附加到生成记录和模板列表的 API 请求中，展示该团队的共享数据。
3. WHEN 用户选择「个人」上下文，THE System SHALL 不附加 `teamId` 查询参数，展示用户个人的数据。
4. THE System SHALL 将当前选中的上下文存储在客户端状态中（如 React Context），在页面导航时保持选中状态。
5. WHILE 用户未加入任何团队，THE Dashboard_Layout SHALL 不显示上下文切换器。

---

## 正确性属性（Correctness Properties）

### P1：模板表单客户端校验与服务端校验一致性

客户端 Zod schema 的校验规则必须与服务端一致：名称 1-100 字符、tone 枚举值匹配、custom_instructions 最长 2000 字符。

- 对于所有通过客户端校验的输入，提交到服务端后不应返回 `INVALID_INPUT` 错误（排除并发冲突等非校验类错误）。
- 对于所有被客户端校验拦截的输入，提交到服务端也应返回 `INVALID_INPUT` 错误。

### P2：模板选择器与生成请求参数一致性

当用户选择模板后发起生成请求，请求体中的 `templateId` 必须等于用户选中的模板 ID；当用户未选择模板时，请求体中不包含 `templateId` 字段。

- 对于所有选择了模板 T 的生成请求，`POST /api/generate` 请求体中 `templateId === T.id`。
- 对于所有未选择模板的生成请求，`POST /api/generate` 请求体中不存在 `templateId` 字段。

### P3：批量任务内容项数量不变量

批量生成表单提交时，请求体中的 `items` 数组长度必须等于用户在 UI 中添加的内容项数量，且在 1-50 范围内。

- 对于所有用户添加了 N 条内容项的批量提交，`POST /api/generate/batch` 请求体中 `items.length === N`。

### P4：批量任务轮询状态机

轮询行为必须与任务状态严格对应：`pending` 或 `processing` 时持续轮询，`completed`、`partial` 或 `failed` 时停止轮询。

- 对于所有状态为 `pending` 或 `processing` 的任务，轮询定时器必须处于活跃状态。
- 对于所有状态为 `completed`、`partial` 或 `failed` 的任务，轮询定时器必须已被清除。

### P5：团队角色权限 UI 一致性

UI 中按钮和操作的可见性必须与用户角色严格对应：`member` 不可见邀请和移除按钮，`admin` 可见邀请但不可见移除按钮，`owner` 可见所有操作按钮。

- 对于所有角色为 `member` 的用户，「邀请成员」按钮和「移除」按钮在 DOM 中不存在。
- 对于所有角色为 `admin` 的用户，「邀请成员」按钮存在，「移除」按钮不存在。
- 对于所有角色为 `owner` 的用户，「邀请成员」按钮和「移除」按钮均存在。

### P6：团队上下文切换数据隔离

切换团队上下文后，页面展示的数据必须对应所选团队；切换回个人上下文后，展示个人数据。

- 对于所有从「个人」切换到「团队 T」的操作，后续 API 请求必须包含 `teamId=T.id` 查询参数。
- 对于所有从「团队 T」切换到「个人」的操作，后续 API 请求不包含 `teamId` 查询参数。

### P7：Toast 通知自动消失

所有 Toast 通知必须在显示 3 秒后自动从 DOM 中移除，不产生内存泄漏。

- 对于所有触发的 Toast 通知，3 秒后该 Toast 元素不再存在于 DOM 中。
- 对于所有组件卸载时仍存在的 Toast 定时器，必须被正确清除。
