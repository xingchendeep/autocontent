# 实施计划：统一历史记录（方案 C）

## 概述

分步实现统一历史记录体验：先扩展类型和工具函数，再改造后台历史页面增加内容摘要，然后新增详情 API 路由，最后改造首页实现登录用户云端历史替代本地历史。每一步都在前一步基础上递增构建，最终完成端到端集成。

## 任务

- [x] 1. 扩展类型定义与摘要工具函数
  - [x] 1.1 在 `src/types/index.ts` 的 `HistorySummaryItem` 接口中新增 `inputSnippet: string` 字段
    - _需求: 4.1, 4.2_
  - [x] 1.2 在 `src/lib/snippets.ts` 中创建 `createSnippet(inputContent: string | null | undefined): string` 工具函数
    - 对输入执行 `trim()` 后截取前 100 个字符
    - 纯空白字符串返回空字符串
    - _需求: 1.1, 4.3_
  - [ ]* 1.3 编写 `createSnippet` 的属性测试
    - **Property 1: 摘要截取正确性**
    - **验证: 需求 1.1, 4.3**

- [x] 2. 改造后台历史 API 和页面，增加内容摘要
  - [x] 2.1 修改 `src/app/api/history/route.ts`，在 select 查询中新增 `input_content` 字段，映射时使用 `createSnippet` 生成 `inputSnippet`
    - _需求: 1.1, 4.2_
  - [x] 2.2 修改 `src/app/dashboard/history/page.tsx` 的 `fetchHistory` 函数，select 查询新增 `input_content`，映射时使用 `createSnippet` 生成 `inputSnippet`
    - _需求: 1.3_
  - [x] 2.3 修改 `src/components/dashboard/HistoryItem.tsx`，在时间戳行下方、平台标签行上方展示摘要文本
    - `inputSnippet` 长度等于 100 时末尾显示 `…`
    - `inputSnippet` 为空字符串时显示「无内容预览」占位文本
    - _需求: 1.2, 1.4, 1.5_
  - [ ]* 2.4 编写 `HistoryItem` 摘要展示的属性测试
    - **Property 2: 摘要省略号展示**
    - **验证: 需求 1.4**
  - [ ]* 2.5 编写 `HistoryItem` 完整渲染的属性测试
    - **Property 3: 历史条目完整渲染**
    - **验证: 需求 1.2, 3.3**

- [x] 3. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 4. 新增历史详情 API 路由
  - [x] 4.1 创建 `src/app/api/history/[id]/route.ts`，实现 `GET /api/history/[id]`
    - 使用 `getSession` 验证认证状态，未认证返回 401
    - 查询 `generations` 表获取完整记录（含 `result_json`、`input_content`、`platforms` 等）
    - RLS 保证只能查询自己的记录，不存在时返回 404
    - 响应遵循 `ApiSuccess<HistoryDetailResponse>` 格式
    - _需求: 6.1, 6.2_
  - [ ]* 4.2 编写详情 API 的单元测试
    - 测试未认证返回 401、ID 不存在返回 404
    - _需求: 6.2, 6.3_

- [x] 5. 创建 `useAuth` Hook
  - [x] 5.1 创建 `src/hooks/useAuth.ts`，实现登录状态检测
    - 使用 `createSupabaseBrowserClient` 获取初始 session
    - 监听 `onAuthStateChange` 实时更新 user 状态
    - 返回 `{ user, loading }` 接口
    - _需求: 5.1, 5.2_
  - [ ]* 5.2 编写 `useAuth` Hook 的单元测试
    - 测试初始 loading 状态、session 变化响应
    - _需求: 5.1, 5.3_

- [x] 6. 创建 `useCloudHistory` Hook
  - [x] 6.1 创建 `src/hooks/useCloudHistory.ts`，实现云端历史获取
    - `enabled` 为 `true` 时 fetch `/api/history?limit=10`
    - 返回 `{ items, loading, error, refresh }` 接口
    - 请求失败时设置 `error` 状态供调用方回退
    - _需求: 2.1, 2.3_
  - [ ]* 6.2 编写 `useCloudHistory` Hook 的单元测试
    - 测试 enabled=false 时不发请求、fetch 失败时 error 状态
    - _需求: 2.1, 2.5_

- [x] 7. 改造首页，集成云端历史
  - [x] 7.1 修改 `src/app/page.tsx`，引入 `useAuth` 和 `useCloudHistory`
    - 登录用户展示云端历史，未登录用户保持本地历史
    - 登录状态检测完成前不渲染历史区域，避免闪烁
    - _需求: 2.1, 2.2, 5.3_
  - [x] 7.2 实现云端历史加载状态指示器
    - 云端历史加载期间显示 loading 状态
    - _需求: 2.4_
  - [x] 7.3 实现 API 失败回退逻辑
    - History API 请求失败时回退到 localStorage 本地历史
    - _需求: 2.5_
  - [x] 7.4 实现云端历史条目点击恢复生成结果
    - 点击云端历史条目时调用 `GET /api/history/{id}` 获取完整 `result_json`
    - 获取成功后 dispatch `RESTORE` 恢复结果
    - 获取失败时显示错误提示
    - _需求: 3.1, 3.2, 6.1, 6.3_
  - [x] 7.5 实现生成完成后刷新云端历史
    - 登录用户生成成功后调用 `refresh()` 刷新云端历史列表
    - _需求: 2.3_
  - [x] 7.6 首页云端历史条目展示平台列表和生成时间
    - 与本地历史条目展示方式一致
    - _需求: 3.1, 3.3_
  - [ ]* 7.7 编写首页历史切换的单元测试
    - 测试登录用户看到云端历史、未登录用户看到本地历史、API 失败回退到本地历史
    - _需求: 2.1, 2.2, 2.5_

- [x] 8. 最终检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。

## 备注

- 标记 `*` 的任务为可选，可跳过以加速 MVP 交付
- 每个任务引用了具体需求编号以确保可追溯性
- 检查点确保增量验证
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
- 不需要新增数据库表或字段，`input_content` 已存在于 `generations` 表
