# 实施计划：v2-frontend-ui

## 概述

为 AutoContent Pro v2.0 后端五项差异化功能构建完整的前端 UI 层。按照依赖顺序实施：全局 UI 基础设施 → 类型与校验 → Hooks → 组件 → 页面 → 集成。所有代码使用 TypeScript，遵循项目现有的 `@/` 别名、PascalCase 组件、useXxx hooks 等约定。

## 任务列表

- [x] 1. 全局 UI 基础设施组件
  - [x] 1.1 创建 Toast 通知系统（ToastProvider + ToastContainer + useToast hook）
    - 创建 `src/contexts/ToastContext.tsx`，实现 `ToastProvider` 和 `useToast` hook
    - 创建 `src/components/ui/Toast.tsx`，实现单条 Toast 组件和 `ToastContainer`
    - Toast 类型支持 `success`、`error`、`info`，定位 `fixed top-4 right-4 z-50`
    - 3 秒后自动移除，支持 Escape 键关闭，使用 `role="alert"` 和 `aria-live="polite"`
    - 组件卸载时清除所有定时器
    - _需求: 11.1, 11.2, 11.6_

  - [ ]* 1.2 编写 Toast 通知属性测试
    - **Property 11: Toast 通知自动消失**
    - **验证: 需求 11.1, 11.6**

  - [x] 1.3 创建 Skeleton 骨架屏组件
    - 创建 `src/components/ui/Skeleton.tsx`
    - 支持 `rows`（默认 3）和 `widths`（每行宽度数组）属性
    - _需求: 11.3_

  - [x] 1.4 创建 EmptyState 空状态组件
    - 创建 `src/components/ui/EmptyState.tsx`
    - 接受 `title`、`description`、`action`（label + onClick）属性
    - _需求: 11.4_

  - [x] 1.5 创建 ConfirmDialog 确认对话框组件
    - 创建 `src/components/ui/ConfirmDialog.tsx`
    - 接受 `open`、`title`、`message`、`onConfirm`、`onCancel`、`destructive` 属性
    - 支持 Escape 键关闭，打开时 focus trap
    - _需求: 11.5_

- [x] 2. 类型定义与 Zod 校验 schemas
  - [x] 2.1 扩展前端类型定义
    - 在 `src/types/index.ts` 中新增模板、批量任务、团队相关类型
    - 包括 `ToneValue`、`LengthValue`、`UserTemplate`、`BatchJobStatus`、`BatchJobItem`、`TeamRole`、`TeamSummary`、`TeamMember`、`TeamInvitation`
    - _需求: 2.2, 4.6, 5.2, 6.2, 7.1_

  - [x] 2.2 创建客户端 Zod 校验 schemas
    - 创建 `src/lib/validations/template.ts`（templateFormSchema）
    - 创建 `src/lib/validations/batch.ts`（batchFormSchema）
    - 创建 `src/lib/validations/team.ts`（teamNameSchema、inviteFormSchema）
    - 校验规则与服务端保持一致
    - _需求: 2.11, 4.10, 6.10, 7.8_

  - [ ]* 2.3 编写 Zod 校验一致性属性测试
    - **Property 3: 客户端 Zod 校验与服务端规则一致性**
    - **验证: 需求 2.11, 4.10, 6.10, 7.8**

- [x] 3. 检查点 - 确保基础设施和类型就绪
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 4. 团队上下文与核心 Hooks
  - [x] 4.1 创建 TeamContext 上下文
    - 创建 `src/contexts/TeamContext.tsx`，实现 `TeamContextProvider` 和 `useTeamContext` hook
    - 存储当前选中的 `teamId`（`string | null`），跨页面保持
    - _需求: 12.4_

  - [ ]* 4.2 编写团队上下文切换数据隔离属性测试
    - **Property 10: 团队上下文切换数据隔离**
    - **验证: 需求 12.2, 12.3**

  - [x] 4.3 创建 useTemplates hook
    - 创建 `src/hooks/useTemplates.ts`
    - 实现模板列表获取（支持 `teamId` 参数）、创建、更新、删除功能
    - 错误通过 `useToast` 显示
    - _需求: 2.1, 2.4, 2.6, 2.7, 3.1_

  - [x] 4.4 创建 useBatchJob hook
    - 创建 `src/hooks/useBatchJob.ts`
    - 实现批量任务提交（`POST /api/generate/batch`）和轮询（`GET /api/jobs/:id`，5 秒间隔）
    - 终态（`completed`/`partial`/`failed`）时自动停止轮询
    - 组件卸载时清除定时器
    - _需求: 4.6, 5.1, 5.4, 5.5_

  - [ ]* 4.5 编写批量任务轮询状态机属性测试
    - **Property 6: 批量任务轮询状态机**
    - **验证: 需求 5.4, 5.5**

  - [x] 4.6 创建 useTeams hook
    - 创建 `src/hooks/useTeams.ts`
    - 实现团队列表获取（`GET /api/teams`）和团队创建（`POST /api/teams`）
    - _需求: 6.1, 6.4_

  - [x] 4.7 创建 useTeamMembers hook
    - 创建 `src/hooks/useTeamMembers.ts`
    - 实现成员列表获取、邀请发送（`POST /api/teams/:id/invitations`）、成员移除（`DELETE /api/teams/:id/members/:userId`）
    - _需求: 6.6, 7.1, 7.2, 7.5_

- [x] 5. 检查点 - 确保 Hooks 层就绪
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 6. 模板管理组件
  - [x] 6.1 创建 TemplateForm 组件
    - 创建 `src/components/dashboard/TemplateForm.tsx`
    - 包含名称、语气下拉（专业/轻松/幽默/权威/共情）、长度下拉（短/中/长，默认中）、自定义指令字段
    - 使用 Zod schema 进行客户端预校验，显示字段级错误
    - 支持创建和编辑模式（通过 `initialValues` 区分）
    - _需求: 2.3, 2.5, 2.8, 2.11_

  - [x] 6.2 创建 TemplateManager 组件
    - 创建 `src/components/dashboard/TemplateManager.tsx`
    - 使用 `useTemplates` hook 获取数据
    - 卡片列表展示（名称、语气中文标签、长度、指令摘要前 80 字符、更新时间）
    - 每卡片「编辑」「删除」按钮，删除使用 ConfirmDialog 确认
    - 加载态使用 Skeleton，空态使用 EmptyState
    - _需求: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.9, 2.10_

  - [ ]* 6.3 编写模板卡片渲染完整性属性测试
    - **Property 2: 模板卡片渲染完整性**
    - **验证: 需求 2.2**

  - [x] 6.4 创建 TemplateSelector 组件
    - 创建 `src/components/generate/TemplateSelector.tsx`
    - 下拉选择器，首项「不使用模板」，选中后显示参数标签（语气 · 长度）
    - 仅已认证用户可见，加载中显示 spinner，加载失败显示提示但不阻塞生成
    - _需求: 3.1, 3.2, 3.5, 3.6, 3.7_

  - [ ]* 6.5 编写模板选择与生成请求参数一致性属性测试
    - **Property 4: 模板选择与生成请求参数一致性**
    - **验证: 需求 3.2, 3.3, 3.4**

- [x] 7. 批量生成组件
  - [x] 7.1 创建 BatchPanel 组件
    - 创建 `src/components/dashboard/BatchPanel.tsx`
    - 内容项动态添加/删除（1-50 条），50 条时禁用添加按钮
    - 复用 PlatformSelector 和 TemplateSelector 逻辑
    - 使用 Zod schema 客户端预校验
    - 提交成功（HTTP 202）后跳转到任务详情视图
    - 处理 HTTP 400（校验错误）和 HTTP 402（套餐升级提示）
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [ ]* 7.2 编写批量任务内容项数量不变量属性测试
    - **Property 5: 批量任务内容项数量不变量**
    - **验证: 需求 4.3, 4.6**

  - [x] 7.3 创建 BatchJobDetail 组件
    - 创建 `src/components/dashboard/BatchJobDetail.tsx`
    - 显示整体进度：状态标签（中文映射）、进度条（completedCount/itemCount）、计数
    - 结果列表：序号、状态标签、可展开/折叠平台文案、复制按钮、失败时显示错误信息
    - 加载态使用 Skeleton，404 显示「任务不存在」
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [ ]* 7.4 编写批量任务进度渲染正确性属性测试
    - **Property 7: 批量任务进度渲染正确性**
    - **验证: 需求 5.2, 5.3**

  - [ ]* 7.5 编写批量结果项渲染完整性属性测试
    - **Property 8: 批量结果项渲染完整性**
    - **验证: 需求 5.6, 5.7**

- [x] 8. 检查点 - 确保模板和批量组件就绪
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 9. 团队管理组件
  - [x] 9.1 创建 TeamPanel 组件
    - 创建 `src/components/dashboard/TeamPanel.tsx`
    - 团队卡片列表（名称、角色、成员数），「创建团队」按钮 + 表单
    - 处理 HTTP 402（套餐升级提示）
    - 点击卡片进入 TeamDetail 视图
    - 加载态使用 Skeleton，空态使用 EmptyState
    - 使用 Zod schema 校验团队名称
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.8, 6.9, 6.10_

  - [x] 9.2 创建 TeamDetail 组件
    - 创建 `src/components/dashboard/TeamDetail.tsx`
    - 成员表格（邮箱、角色标签、加入时间）
    - 根据角色控制按钮可见性：member 无按钮、admin 有邀请无移除、owner 全部可见
    - 移除使用 ConfirmDialog 确认
    - _需求: 6.6, 6.7, 7.5, 7.6, 7.7_

  - [ ]* 9.3 编写团队角色权限 UI 一致性属性测试
    - **Property 9: 团队角色权限 UI 一致性**
    - **验证: 需求 7.6, 7.7**

  - [x] 9.4 创建 InviteForm 组件
    - 创建 `src/components/dashboard/InviteForm.tsx`
    - 邮箱输入 + 角色选择（管理员/成员，默认成员）
    - 使用 Zod schema 校验邮箱格式
    - 处理 HTTP 403（无权限）和 HTTP 400（校验错误）
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.8_

- [x] 10. 邀请接受页面
  - [x] 10.1 创建 InvitationAccept 组件和页面
    - 创建 `src/components/teams/InvitationAccept.tsx` 客户端组件
    - 创建 `src/app/teams/accept/page.tsx` 页面（从 searchParams 获取 token）
    - 显示邀请信息（团队名称、角色）和「接受邀请」按钮
    - 未登录时显示「请先登录」提示并提供登录链接
    - token 过期时显示「邀请已失效」，不显示接受按钮
    - 接受成功后跳转到 `/dashboard/teams`
    - _需求: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 11. API Keys 页面增强与插件文档页
  - [x] 11.1 创建 ApiGuide 使用指引组件
    - 创建 `src/components/dashboard/ApiGuide.tsx`
    - 显示 API 端点（`POST /api/v1/generate`）、认证方式、限流说明
    - 可折叠的 curl 请求示例代码块
    - _需求: 9.1, 9.2_

  - [x] 11.2 增强 API Keys 页面
    - 修改 `src/app/dashboard/api-keys/page.tsx`，顶部渲染 ApiGuide
    - 检查用户套餐 `has_api_access`，若为 false 则禁用创建功能并显示升级提示
    - 保留现有 Key 创建、列表、撤销功能不变
    - _需求: 9.3, 9.4_

  - [x] 11.3 创建浏览器插件文档页
    - 创建 `src/app/dashboard/extension/page.tsx`
    - 功能介绍（支持的页面类型、核心功能、使用前提）
    - 安装指引步骤（开发者模式加载）
    - 使用流程说明
    - 「前往 API Keys 管理」链接按钮
    - _需求: 10.1, 10.2, 10.3, 10.4_

- [x] 12. 仪表盘导航扩展与上下文切换
  - [x] 12.1 扩展仪表盘导航栏
    - 修改 `src/app/dashboard/layout.tsx`
    - 新增导航项：「模板」「批量生成」「团队」「插件」
    - 使用 `usePathname()` 实现当前路径高亮（需转为客户端组件或提取导航组件）
    - 移动端（< 768px）水平滚动布局 `overflow-x-auto whitespace-nowrap`
    - 保留现有导航项不变
    - _需求: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 12.2 编写导航项激活高亮一致性属性测试
    - **Property 1: 导航项激活高亮一致性**
    - **验证: 需求 1.2**

  - [x] 12.3 集成 TeamContextSwitcher 到导航栏
    - 创建 `src/components/dashboard/TeamContextSwitcher.tsx`
    - 下拉菜单：「个人」+ 用户所属团队列表
    - 仅当用户属于至少一个团队时显示
    - 在 `dashboard/layout.tsx` 中包裹 `TeamContextProvider` 和 `ToastProvider`
    - _需求: 12.1, 12.2, 12.3, 12.5_

- [x] 13. 页面路由创建与集成
  - [x] 13.1 创建模板管理页面
    - 创建 `src/app/dashboard/templates/page.tsx`
    - 渲染 TemplateManager 组件
    - _需求: 2.1_

  - [x] 13.2 创建批量生成页面
    - 创建 `src/app/dashboard/batch/page.tsx`
    - 渲染 BatchPanel 组件
    - _需求: 4.1_

  - [x] 13.3 创建团队管理页面
    - 创建 `src/app/dashboard/teams/page.tsx`
    - 渲染 TeamPanel 组件
    - _需求: 6.1_

  - [x] 13.4 集成 TemplateSelector 到首页生成流程
    - 修改 `src/app/page.tsx`，在平台选择器上方添加 TemplateSelector
    - 修改生成请求逻辑，选中模板时在 `POST /api/generate` 请求体中附带 `templateId`
    - 未登录时不显示 TemplateSelector
    - _需求: 3.1, 3.3, 3.4, 3.5_

- [x] 14. 最终检查点 - 确保所有测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号以确保可追溯性
- 检查点确保增量验证
- 属性测试验证通用正确性属性（Property 1-11）
- 单元测试验证具体示例和边界情况
