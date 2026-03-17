# 设计文档：v2-frontend-ui

## 1. 概述

### 目标

为 AutoContent Pro v2.0 后端五项差异化功能构建完整的前端 UI 层，包括：

- 仪表盘导航扩展（新增模板、批量、团队、插件入口）
- 自定义模板管理页面与生成流程集成
- 批量生成提交与任务进度查看
- 团队创建、成员管理、邀请接受
- API Keys 页面增强（使用指引）
- 浏览器插件文档页
- 全局 UI 基础设施（Toast、Skeleton、EmptyState、ConfirmDialog）
- 团队上下文切换

### 范围

仅涉及前端页面、组件、hooks 和客户端状态管理。不修改后端 API 路由或数据库 schema。所有数据通过已有的 v2 后端 API 获取和提交。

### 依赖

| 模块 | 提供的能力 |
|------|-----------|
| `v2-product-differentiation` | 模板 CRUD API、批量生成 API、团队协作 API、API Key 管理 API、外部 API |
| 现有前端 | Dashboard Layout、PlatformSelector、ContentInput、GenerateButton、ApiKeysPanel |

---

## 2. 系统架构

### 2.1 前端架构总览

```mermaid
graph TB
    subgraph 页面层 App Router
        DashLayout[Dashboard Layout<br/>导航 + 上下文切换]
        HomePage[首页 /]
        TemplatePage[/dashboard/templates]
        BatchPage[/dashboard/batch]
        TeamsPage[/dashboard/teams]
        ExtensionPage[/dashboard/extension]
        ApiKeysPage[/dashboard/api-keys]
        AcceptPage[/teams/accept]
    end

    subgraph 组件层
        TemplateManager[TemplateManager]
        TemplateForm[TemplateForm]
        TemplateSelector[TemplateSelector]
        BatchPanel[BatchPanel]
        BatchJobDetail[BatchJobDetail]
        TeamPanel[TeamPanel]
        TeamDetail[TeamDetail]
        InviteForm[InviteForm]
        InvitationAccept[InvitationAccept]
        Toast[Toast + ToastContainer]
        Skeleton[Skeleton]
        EmptyState[EmptyState]
        ConfirmDialog[ConfirmDialog]
        ContextSwitcher[TeamContextSwitcher]
    end

    subgraph Hooks 层
        useTemplates[useTemplates]
        useBatchJob[useBatchJob]
        useTeams[useTeams]
        useTeamMembers[useTeamMembers]
        useTeamContext[useTeamContext]
        useToast[useToast]
    end

    subgraph 后端 API
        TemplateAPI[/api/templates]
        BatchAPI[/api/generate/batch]
        JobAPI[/api/jobs/:id]
        TeamAPI[/api/teams]
        InviteAPI[/api/teams/:id/invitations]
        KeysAPI[/api/keys]
        GenerateAPI[/api/generate]
    end

    DashLayout --> ContextSwitcher
    HomePage --> TemplateSelector
    TemplatePage --> TemplateManager
    TemplateManager --> TemplateForm
    BatchPage --> BatchPanel
    BatchPanel --> BatchJobDetail
    TeamsPage --> TeamPanel
    TeamPanel --> TeamDetail
    TeamDetail --> InviteForm
    AcceptPage --> InvitationAccept

    TemplateManager --> useTemplates
    TemplateSelector --> useTemplates
    BatchPanel --> useBatchJob
    TeamPanel --> useTeams
    TeamDetail --> useTeamMembers
    ContextSwitcher --> useTeamContext

    useTemplates --> TemplateAPI
    useBatchJob --> BatchAPI
    useBatchJob --> JobAPI
    useTeams --> TeamAPI
    useTeamMembers --> InviteAPI
    TemplateSelector --> GenerateAPI
```

### 2.2 状态管理策略

| 状态类型 | 方案 | 说明 |
|---------|------|------|
| 团队上下文 | React Context (`TeamContextProvider`) | 跨页面保持选中的团队 ID |
| Toast 通知 | React Context (`ToastProvider`) | 全局通知队列 |
| 页面级数据 | 自定义 hooks（`useTemplates`、`useBatchJob` 等） | 每个页面独立管理 fetch/loading/error |
| 表单状态 | `useState` + Zod 校验 | 组件内部管理 |

### 2.3 路由结构

```
src/app/
  page.tsx                          # 首页（已有，集成 TemplateSelector）
  teams/
    accept/page.tsx                 # 邀请接受页（公开路由）
  dashboard/
    layout.tsx                      # 仪表盘布局（扩展导航 + 上下文切换）
    page.tsx                        # 控制台（已有）
    history/page.tsx                # 生成记录（已有）
    scripts/page.tsx                # 脚本库（已有）
    api-keys/page.tsx               # API Keys（增强）
    subscription/page.tsx           # 订阅（已有）
    templates/page.tsx              # 模板管理（新增）
    batch/page.tsx                  # 批量生成（新增）
    teams/page.tsx                  # 团队管理（新增）
    extension/page.tsx              # 插件文档（新增）
```

---

## 3. 组件与接口设计

### 3.1 全局基础设施组件

#### Toast 通知系统

```typescript
// src/components/ui/Toast.tsx
interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}
```

```typescript
// src/hooks/useToast.ts
interface UseToastReturn {
  toast: (params: { type: 'success' | 'error' | 'info'; message: string }) => void;
}
```

实现要点：
- `ToastProvider` 包裹在 `dashboard/layout.tsx` 中
- 每条 Toast 3 秒后自动移除，使用 `setTimeout` + cleanup
- 使用 `role="alert"` 和 `aria-live="polite"` 确保屏幕阅读器可访问
- 支持 Escape 键关闭当前 Toast
- 定位：页面右上角 `fixed top-4 right-4 z-50`

#### Skeleton 骨架屏

```typescript
// src/components/ui/Skeleton.tsx
interface SkeletonProps {
  rows?: number;       // 默认 3
  widths?: string[];   // 每行宽度，如 ['100%', '80%', '60%']
}
```

#### EmptyState 空状态

```typescript
// src/components/ui/EmptyState.tsx
interface EmptyStateProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

#### ConfirmDialog 确认对话框

```typescript
// src/components/ui/ConfirmDialog.tsx
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;  // 默认 "确认"
  cancelLabel?: string;   // 默认 "取消"
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;  // true 时确认按钮为红色
}
```

实现要点：
- 使用 `<dialog>` 元素或 Portal + backdrop
- 支持 Escape 键关闭
- 打开时 focus trap

### 3.2 仪表盘导航扩展

修改 `src/app/dashboard/layout.tsx`：

```typescript
// 导航项配置
const NAV_ITEMS = [
  { href: '/dashboard', label: '控制台' },
  { href: '/dashboard/history', label: '生成记录' },
  { href: '/dashboard/scripts', label: '脚本库' },
  { href: '/dashboard/templates', label: '模板' },       // 新增
  { href: '/dashboard/batch', label: '批量生成' },       // 新增
  { href: '/dashboard/teams', label: '团队' },           // 新增
  { href: '/dashboard/api-keys', label: 'API Keys' },
  { href: '/dashboard/extension', label: '插件' },       // 新增
  { href: '/dashboard/subscription', label: '订阅' },
];
```

实现要点：
- 使用 `usePathname()` 获取当前路径，匹配时应用高亮样式（`text-zinc-900 font-medium`）
- 移动端（< 768px）：水平滚动布局 `overflow-x-auto whitespace-nowrap`
- 导航栏右侧集成 `TeamContextSwitcher`（仅当用户属于团队时显示）

### 3.3 团队上下文切换器

```typescript
// src/components/dashboard/TeamContextSwitcher.tsx
interface TeamContextSwitcherProps {
  teams: TeamSummary[];
  currentTeamId: string | null;
  onSwitch: (teamId: string | null) => void;
}
```

```typescript
// src/hooks/useTeamContext.ts
interface TeamContextValue {
  currentTeamId: string | null;
  setTeamId: (teamId: string | null) => void;
}
```

```typescript
// src/contexts/TeamContext.tsx
// React Context Provider，存储当前选中的 teamId
// 在 dashboard/layout.tsx 中包裹 children
```

实现要点：
- 下拉菜单选项：「个人」+ 用户所属团队列表
- 切换后，`useTemplates` 和历史列表的 API 请求自动附加 `?teamId=xxx`
- 状态仅存于 React Context，页面导航时保持

### 3.4 模板管理组件

#### TemplateManager

```typescript
// src/components/dashboard/TemplateManager.tsx
// 无外部 props，内部使用 useTemplates hook
```

内部结构：
- 顶部：标题 + 「新建模板」按钮
- 列表区：模板卡片网格（每卡片显示名称、语气标签、长度、指令摘要前 80 字符、更新时间）
- 每卡片操作：「编辑」「删除」按钮
- 加载态：Skeleton
- 空态：EmptyState（「创建第一个模板」按钮）
- 表单：TemplateForm（创建/编辑共用，通过 `initialValues` 区分）

#### TemplateForm

```typescript
// src/components/dashboard/TemplateForm.tsx
interface TemplateFormProps {
  initialValues?: {
    name: string;
    tone: ToneValue;
    length: LengthValue;
    customInstructions?: string;
  };
  onSubmit: (values: TemplateFormValues) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

type ToneValue = 'professional' | 'casual' | 'humorous' | 'authoritative' | 'empathetic';
type LengthValue = 'short' | 'medium' | 'long';

interface TemplateFormValues {
  name: string;
  tone: ToneValue;
  length: LengthValue;
  customInstructions?: string;
}
```

Zod schema（客户端预校验）：

```typescript
import { z } from 'zod';

export const templateFormSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100, '名称最长 100 字符'),
  tone: z.enum(['professional', 'casual', 'humorous', 'authoritative', 'empathetic']),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  customInstructions: z.string().max(2000, '自定义指令最长 2000 字符').optional(),
});
```

#### TemplateSelector

```typescript
// src/components/generate/TemplateSelector.tsx
interface TemplateSelectorProps {
  selectedId: string | null;
  onSelect: (templateId: string | null) => void;
}
```

实现要点：
- 下拉选择器，首项为「不使用模板」
- 选中模板后显示参数标签（如「语气：专业 · 长度：中」）
- 仅已认证用户可见
- 加载中显示 spinner
- 加载失败显示提示但不阻塞生成

### 3.5 批量生成组件

#### BatchPanel

```typescript
// src/components/dashboard/BatchPanel.tsx
// 无外部 props，内部管理表单状态和任务详情视图
```

内部状态机：
- `form`：显示批量输入表单
- `submitted`：显示任务进度（BatchJobDetail）

表单结构：
- 内容项列表（动态添加/删除，1-50 条）
- 统一平台选择器（复用 PlatformSelector）
- 可选模板选择器
- 「提交批量任务」按钮

Zod schema：

```typescript
export const batchFormSchema = z.object({
  items: z.array(
    z.object({
      content: z.string().min(1, '内容不能为空'),
    })
  ).min(1, '至少添加一条内容').max(50, '最多 50 条内容'),
  platforms: z.array(z.string()).min(1, '至少选择一个平台'),
  templateId: z.string().uuid().optional(),
});
```

#### BatchJobDetail

```typescript
// src/components/dashboard/BatchJobDetail.tsx
interface BatchJobDetailProps {
  jobId: string;
}
```

实现要点：
- 显示整体进度：状态标签、进度条（`completedCount / itemCount`）、总数/完成/失败计数
- `pending` 或 `processing` 时每 5 秒轮询 `GET /api/jobs/:id`
- 终态（`completed`/`partial`/`failed`）时停止轮询，展示结果列表
- 每条结果项：序号、状态标签、可展开/折叠的平台文案、复制按钮
- 加载态：Skeleton
- 404：显示「任务不存在」

### 3.6 团队管理组件

#### TeamPanel

```typescript
// src/components/dashboard/TeamPanel.tsx
// 无外部 props，内部使用 useTeams hook
```

内部结构：
- 团队列表视图：卡片形式（名称、角色、成员数）
- 「创建团队」按钮 + 表单（团队名称，Zod 校验）
- 点击卡片进入 TeamDetail
- 加载态：Skeleton
- 空态：EmptyState

#### TeamDetail

```typescript
// src/components/dashboard/TeamDetail.tsx
interface TeamDetailProps {
  teamId: string;
  currentUserRole: 'owner' | 'admin' | 'member';
}
```

内部结构：
- 成员表格：邮箱、角色标签、加入时间
- 「邀请成员」按钮（仅 owner/admin 可见）
- 「移除」按钮（仅 owner 可见，不可移除自己）
- InviteForm 弹出表单

#### InviteForm

```typescript
// src/components/dashboard/InviteForm.tsx
interface InviteFormProps {
  teamId: string;
  onSuccess: () => void;
  onCancel: () => void;
}
```

Zod schema：

```typescript
export const inviteFormSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  role: z.enum(['admin', 'member']).default('member'),
});
```

### 3.7 邀请接受页面

```typescript
// src/app/teams/accept/page.tsx
// Server Component，从 searchParams 获取 token
// 调用后端验证 token 有效性，渲染 InvitationAccept 客户端组件
```

```typescript
// src/components/teams/InvitationAccept.tsx
interface InvitationAcceptProps {
  token: string;
  teamName: string;
  role: string;
  expired: boolean;
}
```

### 3.8 API Keys 页面增强

在现有 `ApiKeysPanel` 上方添加使用指引区域：

```typescript
// src/components/dashboard/ApiGuide.tsx
// 静态组件，无 props
// 内容：API 端点、认证方式、限流说明、可折叠 curl 示例
```

修改 `src/app/dashboard/api-keys/page.tsx`：
- 顶部渲染 `ApiGuide`
- 检查用户套餐 `has_api_access`，若为 false 则在创建表单位置显示升级提示

### 3.9 浏览器插件文档页

```typescript
// src/app/dashboard/extension/page.tsx
// 静态页面，无需 API 调用
// 内容：功能介绍、安装指引、使用流程、「前往 API Keys 管理」链接
```

---

## 4. Hooks 设计

### 4.1 useTemplates

```typescript
// src/hooks/useTemplates.ts
interface UseTemplatesReturn {
  templates: UserTemplate[];
  loading: boolean;
  error: string | null;
  create: (values: TemplateFormValues) => Promise<boolean>;
  update: (id: string, values: Partial<TemplateFormValues>) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  refresh: () => void;
}

function useTemplates(teamId?: string | null): UseTemplatesReturn;
```

实现要点：
- `GET /api/templates` 获取列表，支持 `?teamId=xxx`
- 创建/更新/删除后自动刷新列表
- 错误通过 `useToast` 显示

### 4.2 useBatchJob

```typescript
// src/hooks/useBatchJob.ts
interface UseBatchJobReturn {
  submit: (params: BatchSubmitParams) => Promise<string | null>; // 返回 jobId
  job: BatchJobStatus | null;
  loading: boolean;
  polling: boolean;
  error: string | null;
  startPolling: (jobId: string) => void;
  stopPolling: () => void;
}

interface BatchSubmitParams {
  items: Array<{ content: string; platforms: PlatformCode[] }>;
  templateId?: string;
}
```

实现要点：
- `submit` 调用 `POST /api/generate/batch`，返回 jobId
- `startPolling` 启动 5 秒间隔轮询 `GET /api/jobs/:id`
- 当 `status` 为 `completed`/`partial`/`failed` 时自动 `stopPolling`
- 组件卸载时清除定时器

### 4.3 useTeams

```typescript
// src/hooks/useTeams.ts
interface UseTeamsReturn {
  teams: TeamSummary[];
  loading: boolean;
  error: string | null;
  create: (name: string) => Promise<boolean>;
  refresh: () => void;
}

interface TeamSummary {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  memberCount: number;
}
```

### 4.4 useTeamMembers

```typescript
// src/hooks/useTeamMembers.ts
interface UseTeamMembersReturn {
  members: TeamMember[];
  loading: boolean;
  error: string | null;
  invite: (email: string, role: 'admin' | 'member') => Promise<boolean>;
  removeMember: (userId: string) => Promise<boolean>;
  refresh: () => void;
}

interface TeamMember {
  userId: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
}
```

### 4.5 useTeamContext

```typescript
// src/hooks/useTeamContext.ts
interface UseTeamContextReturn {
  currentTeamId: string | null;
  setTeamId: (teamId: string | null) => void;
}
```

### 4.6 useToast

```typescript
// src/hooks/useToast.ts
interface UseToastReturn {
  toast: (params: { type: 'success' | 'error' | 'info'; message: string }) => void;
}
```

---

## 5. 数据模型（前端类型定义）

在 `src/types/index.ts` 中新增以下类型：

```typescript
// --- 模板相关 ---

export type ToneValue = 'professional' | 'casual' | 'humorous' | 'authoritative' | 'empathetic';
export type LengthValue = 'short' | 'medium' | 'long';

export interface UserTemplate {
  id: string;
  userId: string;
  name: string;
  tone: ToneValue;
  length: LengthValue;
  customInstructions?: string;
  platformOverrides: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// --- 批量任务相关 ---

export type BatchJobStatusValue = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';

export interface BatchJobStatus {
  jobId: string;
  status: BatchJobStatusValue;
  itemCount: number;
  completedCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  items?: BatchJobItem[];
}

export interface BatchJobItem {
  itemId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  results: Partial<Record<PlatformCode, GeneratePlatformOutput>> | null;
  errorMessage?: string;
}

// --- 团队相关 ---

export type TeamRole = 'owner' | 'admin' | 'member';

export interface TeamSummary {
  id: string;
  name: string;
  role: TeamRole;
  memberCount: number;
}

export interface TeamMember {
  userId: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  teamName: string;
  role: TeamRole;
  expired: boolean;
}
```

### 5.1 Zod Schemas（客户端校验）

```typescript
// src/lib/validations/template.ts
import { z } from 'zod';

export const templateFormSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100, '名称最长 100 字符'),
  tone: z.enum(['professional', 'casual', 'humorous', 'authoritative', 'empathetic']),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  customInstructions: z.string().max(2000, '自定义指令最长 2000 字符').optional(),
});

// src/lib/validations/batch.ts
export const batchFormSchema = z.object({
  items: z.array(
    z.object({ content: z.string().min(1, '内容不能为空') })
  ).min(1, '至少添加一条内容').max(50, '最多 50 条内容'),
  platforms: z.array(z.string()).min(1, '至少选择一个平台'),
  templateId: z.string().uuid().optional(),
});

// src/lib/validations/team.ts
export const teamNameSchema = z.object({
  name: z.string().min(1, '团队名称不能为空').max(100, '团队名称最长 100 字符'),
});

export const inviteFormSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  role: z.enum(['admin', 'member']).default('member'),
});
```



---

## 6. 正确性属性

*属性（Property）是在系统所有合法执行路径上都应成立的特征或行为——本质上是对系统应做什么的形式化陈述。属性是人类可读规范与机器可验证正确性保证之间的桥梁。*

基于对 12 项需求共 60+ 条验收标准的逐条分析，以下属性覆盖了所有可通过属性测试验证的核心行为。

### Property 1：导航项激活高亮一致性

*对于任意*导航项和任意当前路径，当且仅当导航项的 `href` 与当前路径匹配时，该导航项应具有激活样式类；其余导航项不应具有激活样式类。

**Validates: Requirements 1.2**

### Property 2：模板卡片渲染完整性

*对于任意*模板对象（包含 name、tone、length、customInstructions、updatedAt），渲染后的模板卡片应包含：模板名称、tone 的中文标签、length 值、customInstructions 的前 80 字符（超出部分截断）、以及格式化的更新时间。

**Validates: Requirements 2.2**

### Property 3：客户端 Zod 校验与服务端规则一致性

*对于任意*输入值：
- 模板表单：name 长度 1-100 字符、tone 为五个枚举值之一、customInstructions 最长 2000 字符——通过客户端 Zod schema 校验的输入必须也通过服务端校验；被客户端拦截的输入提交到服务端也应返回 `INVALID_INPUT`。
- 批量表单：items 数组长度 1-50、每条 content 非空、至少选择一个平台。
- 团队名称：长度 1-100 字符。
- 邀请邮箱：符合 email 格式。

**Validates: Requirements 2.11, 4.10, 6.10, 7.8**

### Property 4：模板选择与生成请求参数一致性

*对于任意*生成请求：当用户选择了模板 T 时，`POST /api/generate` 请求体中 `templateId` 必须等于 `T.id`，且 TemplateSelector 显示的参数标签（语气、长度）必须与 T 的 tone 和 length 一致；当用户未选择模板时，请求体中不包含 `templateId` 字段。

**Validates: Requirements 3.2, 3.3, 3.4**

### Property 5：批量任务内容项数量不变量

*对于任意*用户在批量表单中添加了 N 条内容项（1 ≤ N ≤ 50），提交时 `POST /api/generate/batch` 请求体中 `items.length` 必须恰好等于 N。当 N 达到 50 时，「添加内容」按钮必须处于禁用状态。

**Validates: Requirements 4.3, 4.6**

### Property 6：批量任务轮询状态机

*对于任意*批量任务状态值：当 `status` 为 `pending` 或 `processing` 时，轮询定时器必须处于活跃状态（每 5 秒触发）；当 `status` 为 `completed`、`partial` 或 `failed` 时，轮询定时器必须已被清除且不再触发。

**Validates: Requirements 5.4, 5.5**

### Property 7：批量任务进度渲染正确性

*对于任意* `BatchJobStatus` 对象（含 `status`、`itemCount`、`completedCount`、`failedCount`），渲染的进度条宽度百分比必须等于 `completedCount / itemCount * 100`，且状态标签文本必须与 `status` 值的中文映射一致。

**Validates: Requirements 5.2, 5.3**

### Property 8：批量结果项渲染完整性

*对于任意* `BatchJobItem` 对象，渲染后的结果项应包含：序号、状态标签（成功/失败）；若状态为成功，应包含各平台文案内容和复制按钮；若状态为失败，应包含错误信息。

**Validates: Requirements 5.6, 5.7**

### Property 9：团队角色权限 UI 一致性

*对于任意*用户角色：
- `member`：「邀请成员」按钮和「移除」按钮均不在 DOM 中。
- `admin`：「邀请成员」按钮存在，「移除」按钮不在 DOM 中。
- `owner`：「邀请成员」按钮和「移除」按钮均存在。

**Validates: Requirements 7.6, 7.7**

### Property 10：团队上下文切换数据隔离

*对于任意*上下文切换操作：当用户选择团队 T 时，后续模板列表和生成记录的 API 请求必须包含 `teamId=T.id` 查询参数；当用户切换回「个人」时，API 请求不包含 `teamId` 查询参数。

**Validates: Requirements 12.2, 12.3**

### Property 11：Toast 通知自动消失

*对于任意*触发的 Toast 通知（无论类型为 success、error 或 info），该 Toast 元素必须在 3 秒后从 DOM 中移除。组件卸载时，所有未到期的 Toast 定时器必须被正确清除，不产生内存泄漏。

**Validates: Requirements 11.1, 11.6**

---

## 7. 错误处理策略

### 7.1 API 错误处理模式

所有 hooks 统一采用以下错误处理模式：

```typescript
// 通用 API 调用封装
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const json = await res.json();
  if (!json.success) {
    throw new ApiRequestError(json.error.code, json.error.message, json.error.details);
  }
  return json.data;
}
```

### 7.2 错误码与 UI 映射

| HTTP 状态 | 错误码 | UI 行为 |
|-----------|--------|---------|
| 400 | `INVALID_INPUT` | 表单字段级错误提示（红色文字 + 边框） |
| 401 | `UNAUTHORIZED` | 重定向到登录页 |
| 402 | `PLAN_LIMIT_REACHED` | 套餐升级提示卡片（含订阅页链接） |
| 403 | `FORBIDDEN` | Toast error「无权限执行此操作」 |
| 404 | `NOT_FOUND` | 页面级错误提示（如「任务不存在」） |
| 429 | `RATE_LIMITED` | Toast error「请求过于频繁，请稍后重试」 |
| 500/503 | `INTERNAL_ERROR` / `SERVICE_UNAVAILABLE` | Toast error「服务暂时不可用，请稍后重试」 |
| 网络错误 | — | Toast error「网络错误，请检查网络连接」 |

### 7.3 降级策略

| 场景 | 降级行为 |
|------|---------|
| 模板列表加载失败 | TemplateSelector 显示「模板加载失败」提示，不阻塞生成流程 |
| 团队列表加载失败 | TeamContextSwitcher 不显示，回退到个人上下文 |
| 批量任务轮询失败 | 保持上次成功获取的状态，下次轮询重试 |
| Toast Provider 未包裹 | hooks 中 toast 调用静默失败（防御性编程） |

### 7.4 加载状态规范

| 组件 | 加载态 |
|------|--------|
| 模板列表 | Skeleton（3 行卡片占位） |
| 批量任务详情 | Skeleton（进度条 + 列表占位） |
| 团队列表 | Skeleton（2 行卡片占位） |
| 成员列表 | Skeleton（表格行占位） |
| TemplateSelector | 内联 spinner + "加载模板中…" |

### 7.5 空状态规范

| 组件 | 空态内容 |
|------|---------|
| 模板列表 | EmptyState：标题「还没有模板」，按钮「创建第一个模板」 |
| 团队列表 | EmptyState：标题「还没有加入团队」，按钮「创建团队」 |
| 批量结果 | 不适用（提交后必有任务） |

---

## 8. 测试策略

### 8.1 测试框架

- 单元测试 / 属性测试：**Vitest** + **fast-check**
- 组件测试：**Vitest** + **@testing-library/react**
- E2E 测试：**Playwright**（已有基础设施）

### 8.2 双测试方法

**单元测试**：验证具体示例、边界情况和错误条件
- 导航项渲染（需求 1.1, 1.4）
- 模板表单提交流程（需求 2.3-2.8）
- TemplateSelector 条件渲染（需求 3.1, 3.5-3.7）
- 批量表单交互（需求 4.1-4.2, 4.7-4.9）
- 任务详情加载和 404 处理（需求 5.1, 5.8-5.9）
- 团队创建和详情导航（需求 6.1, 6.3-6.9）
- 邀请表单和错误处理（需求 7.1-7.5）
- 邀请接受页面各状态（需求 8.1-8.5）
- API Keys 使用指引和套餐限制（需求 9.1-9.4）
- 插件文档页内容（需求 10.1-10.4）
- Toast 键盘操作和无障碍属性（需求 11.2, 11.5-11.6）
- 上下文切换器条件渲染（需求 12.1, 12.4-12.5）

**属性测试**：验证跨所有输入的通用属性
- 每个正确性属性（Property 1-11）对应一个属性测试
- 每个属性测试最少运行 **100 次**迭代

### 8.3 属性测试库

使用 **fast-check** 库（已在项目中使用），不从零实现属性测试。

### 8.4 属性测试配置

每个属性测试必须包含注释标签，格式：

```
// Feature: v2-frontend-ui, Property N: <property_text>
```

每个正确性属性由**单个**属性测试实现。

#### 属性测试列表

**Property 1：导航项激活高亮一致性**
```typescript
// Feature: v2-frontend-ui, Property 1: 导航项激活高亮一致性
fc.assert(fc.property(
  fc.constantFrom(...NAV_ITEMS.map(n => n.href)),
  (currentPath) => {
    // 渲染导航，验证仅 currentPath 匹配的项有激活样式
  }
), { numRuns: 100 });
```

**Property 2：模板卡片渲染完整性**
```typescript
// Feature: v2-frontend-ui, Property 2: 模板卡片渲染完整性
fc.assert(fc.property(
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }),
    tone: fc.constantFrom('professional', 'casual', 'humorous', 'authoritative', 'empathetic'),
    length: fc.constantFrom('short', 'medium', 'long'),
    customInstructions: fc.option(fc.string({ maxLength: 2000 })),
    updatedAt: fc.date().map(d => d.toISOString()),
  }),
  (template) => {
    // 渲染 TemplateCard，验证包含 name、tone 中文标签、length、
    // customInstructions 前 80 字符、updatedAt
  }
), { numRuns: 100 });
```

**Property 3：客户端 Zod 校验一致性**
```typescript
// Feature: v2-frontend-ui, Property 3: 客户端 Zod 校验一致性
fc.assert(fc.property(
  fc.record({
    name: fc.string({ minLength: 0, maxLength: 120 }),
    tone: fc.string(),
    customInstructions: fc.option(fc.string({ maxLength: 2200 })),
  }),
  (input) => {
    const clientResult = templateFormSchema.safeParse(input);
    // 验证：name 1-100 且 tone 在枚举内 且 instructions <= 2000 时通过
    // 否则被拒绝
    const nameValid = input.name.length >= 1 && input.name.length <= 100;
    const toneValid = VALID_TONES.includes(input.tone);
    const instrValid = !input.customInstructions || input.customInstructions.length <= 2000;
    expect(clientResult.success).toBe(nameValid && toneValid && instrValid);
  }
), { numRuns: 100 });
```

**Property 4：模板选择与生成请求参数一致性**
```typescript
// Feature: v2-frontend-ui, Property 4: 模板选择与生成请求参数一致性
fc.assert(fc.property(
  fc.option(fc.record({
    id: fc.uuid(),
    tone: fc.constantFrom(...TONES),
    length: fc.constantFrom(...LENGTHS),
  })),
  (selectedTemplate) => {
    // 模拟选择模板（或不选），触发生成，捕获请求体
    // 验证 templateId 存在性和值的正确性
  }
), { numRuns: 100 });
```

**Property 5：批量任务内容项数量不变量**
```typescript
// Feature: v2-frontend-ui, Property 5: 批量任务内容项数量不变量
fc.assert(fc.property(
  fc.integer({ min: 1, max: 50 }),
  (n) => {
    // 创建 n 条内容项，模拟提交，捕获请求体
    // 验证 items.length === n
    // 当 n === 50 时验证添加按钮禁用
  }
), { numRuns: 100 });
```

**Property 6：批量任务轮询状态机**
```typescript
// Feature: v2-frontend-ui, Property 6: 批量任务轮询状态机
fc.assert(fc.property(
  fc.constantFrom('pending', 'processing', 'completed', 'partial', 'failed'),
  (status) => {
    // 模拟 useBatchJob hook 接收到该 status
    // 验证：pending/processing → polling active
    //       completed/partial/failed → polling stopped
  }
), { numRuns: 100 });
```

**Property 7：批量任务进度渲染正确性**
```typescript
// Feature: v2-frontend-ui, Property 7: 批量任务进度渲染正确性
fc.assert(fc.property(
  fc.record({
    status: fc.constantFrom('pending', 'processing', 'completed', 'partial', 'failed'),
    itemCount: fc.integer({ min: 1, max: 50 }),
    completedCount: fc.integer({ min: 0, max: 50 }),
    failedCount: fc.integer({ min: 0, max: 50 }),
  }).filter(r => r.completedCount + r.failedCount <= r.itemCount),
  (job) => {
    // 渲染 BatchJobDetail，验证进度条宽度 = completedCount/itemCount * 100
    // 验证状态标签文本匹配 STATUS_LABELS[job.status]
  }
), { numRuns: 100 });
```

**Property 8：批量结果项渲染完整性**
```typescript
// Feature: v2-frontend-ui, Property 8: 批量结果项渲染完整性
fc.assert(fc.property(
  fc.record({
    status: fc.constantFrom('completed', 'failed'),
    results: fc.option(fc.constant({ douyin: { content: 'test', tokensInput: 1, tokensOutput: 1, model: 'm' } })),
    errorMessage: fc.option(fc.string({ minLength: 1 })),
  }),
  (item) => {
    // 渲染结果项，验证包含序号和状态标签
    // completed → 包含平台文案和复制按钮
    // failed → 包含错误信息
  }
), { numRuns: 100 });
```

**Property 9：团队角色权限 UI 一致性**
```typescript
// Feature: v2-frontend-ui, Property 9: 团队角色权限 UI 一致性
fc.assert(fc.property(
  fc.constantFrom('owner', 'admin', 'member'),
  (role) => {
    // 渲染 TeamDetail，传入 currentUserRole = role
    // member → 无邀请按钮、无移除按钮
    // admin → 有邀请按钮、无移除按钮
    // owner → 有邀请按钮、有移除按钮
  }
), { numRuns: 100 });
```

**Property 10：团队上下文切换数据隔离**
```typescript
// Feature: v2-frontend-ui, Property 10: 团队上下文切换数据隔离
fc.assert(fc.property(
  fc.option(fc.uuid()),
  (teamId) => {
    // 设置 TeamContext 的 currentTeamId = teamId
    // 触发 useTemplates 的 fetch
    // teamId 非 null → 请求 URL 包含 ?teamId=xxx
    // teamId 为 null → 请求 URL 不包含 teamId 参数
  }
), { numRuns: 100 });
```

**Property 11：Toast 通知自动消失**
```typescript
// Feature: v2-frontend-ui, Property 11: Toast 通知自动消失
fc.assert(fc.asyncProperty(
  fc.constantFrom('success', 'error', 'info'),
  fc.string({ minLength: 1, maxLength: 200 }),
  async (type, message) => {
    // 触发 toast({ type, message })
    // 验证 Toast 元素出现在 DOM 中
    // 快进 3 秒（vi.advanceTimersByTime(3000)）
    // 验证 Toast 元素已从 DOM 中移除
  }
), { numRuns: 100 });
```

### 8.5 测试文件结构

```
tests/
  unit/
    components/
      TemplateManager.test.tsx
      TemplateSelector.test.tsx
      BatchPanel.test.tsx
      BatchJobDetail.test.tsx
      TeamPanel.test.tsx
      TeamDetail.test.tsx
      InvitationAccept.test.tsx
      Toast.test.tsx
      ConfirmDialog.test.tsx
      EmptyState.test.tsx
    hooks/
      useTemplates.test.ts
      useBatchJob.test.ts
      useTeams.test.ts
      useTeamMembers.test.ts
      useTeamContext.test.ts
      useToast.test.ts
    validations/
      template.test.ts
      batch.test.ts
      team.test.ts
  property/
    v2-frontend-ui.property.test.ts
  e2e/
    templates.spec.ts
    batch.spec.ts
    teams.spec.ts
```
