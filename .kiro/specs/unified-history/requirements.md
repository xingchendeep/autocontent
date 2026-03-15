# 需求文档

## 简介

统一历史记录体验（方案 C）：解决首页本地历史与后台云端历史完全割裂的问题。具体包含两个方向：
1. 后台 `/dashboard/history` 增加内容摘要预览（当前仅显示平台、状态、耗时，缺少内容预览）
2. 首页登录后使用云端历史替代 localStorage 本地历史，实现登录用户的历史记录统一体验

## 术语表

- **Homepage**：首页（`/`），client component，匿名和登录用户均可使用生成功能
- **Dashboard_History**：后台历史页面（`/dashboard/history`），server component，仅登录用户可访问
- **HistoryItem**：后台历史列表中的单条记录组件（`HistoryItem.tsx`）
- **Local_History**：基于 localStorage 的本地历史记录，存储在浏览器中
- **Cloud_History**：基于 Supabase generations 表的云端历史记录，仅登录用户的生成记录会写入
- **Generation_Writer**：将生成结果写入数据库的服务模块（`generation-writer.ts`）
- **History_API**：历史记录 API 路由（`/api/history`），返回登录用户的云端历史
- **Content_Snippet**：输入内容的前 N 个字符摘要，用于历史记录预览

## 需求

### 需求 1：后台历史记录增加内容摘要

**用户故事：** 作为登录用户，我希望在后台历史列表中看到每条生成记录的内容摘要，以便快速识别和区分不同的生成记录。

#### 验收标准

1. THE History_API SHALL 在历史列表响应中包含 `inputSnippet` 字段，该字段为 `input_content` 的前 100 个字符
2. THE HistoryItem SHALL 在每条历史记录中显示 Content_Snippet 文本
3. THE Dashboard_History SHALL 在查询 generations 表时包含 `input_content` 字段用于生成摘要
4. WHEN Content_Snippet 超过 100 个字符时，THE HistoryItem SHALL 在末尾显示省略号（`…`）进行截断
5. WHEN `input_content` 为空字符串时，THE HistoryItem SHALL 显示占位文本「无内容预览」

### 需求 2：首页登录用户使用云端历史替代本地历史

**用户故事：** 作为登录用户，我希望在首页看到云端历史记录而非本地历史，以便在不同设备上都能访问我的生成记录。

#### 验收标准

1. WHEN 用户已登录时，THE Homepage SHALL 从 History_API 获取云端历史记录并展示
2. WHEN 用户未登录时，THE Homepage SHALL 继续使用 Local_History 展示本地历史记录
3. WHEN 登录用户完成一次生成后，THE Homepage SHALL 刷新云端历史列表以包含最新记录
4. THE Homepage SHALL 在云端历史加载期间显示加载状态指示器
5. IF History_API 请求失败，THEN THE Homepage SHALL 回退到 Local_History 展示本地历史记录

### 需求 3：首页云端历史记录展示内容摘要

**用户故事：** 作为登录用户，我希望首页的云端历史记录也能显示内容摘要，以保持与本地历史一致的预览体验。

#### 验收标准

1. THE Homepage SHALL 对云端历史记录显示 Content_Snippet 文本，与本地历史的 `inputSnippet` 展示方式一致
2. WHEN 用户点击云端历史记录条目时，THE Homepage SHALL 恢复该记录的生成结果到结果区域
3. THE Homepage 的云端历史条目 SHALL 显示平台列表和生成时间信息

### 需求 4：HistorySummaryItem 类型扩展

**用户故事：** 作为开发者，我希望 HistorySummaryItem 类型包含内容摘要字段，以便在后台和首页统一使用。

#### 验收标准

1. THE HistorySummaryItem 类型 SHALL 包含 `inputSnippet` 字段（类型为 `string`）
2. THE History_API SHALL 在返回的每条记录中填充 `inputSnippet` 字段
3. THE HistorySummaryItem 的 `inputSnippet` 字段 SHALL 与 HistoryRecord 的 `inputSnippet` 字段含义一致（输入内容前 100 个字符）

### 需求 5：首页登录状态检测

**用户故事：** 作为用户，我希望首页能自动检测我的登录状态，以便无缝切换本地历史和云端历史。

#### 验收标准

1. THE Homepage SHALL 在客户端通过 Supabase Browser Client 检测用户登录状态
2. WHEN 用户登录状态发生变化时（登录或登出），THE Homepage SHALL 自动切换历史记录数据源
3. THE Homepage SHALL 在登录状态检测完成前不渲染历史记录区域，避免闪烁

### 需求 6：云端历史恢复生成结果

**用户故事：** 作为登录用户，我希望点击首页云端历史条目时能恢复完整的生成结果，以便查看之前的生成内容。

#### 验收标准

1. WHEN 用户点击云端历史条目时，THE Homepage SHALL 调用 History_API 获取该记录的完整 `result_json`
2. THE History_API SHALL 提供按 generation ID 查询单条记录完整数据的能力
3. IF 获取详情失败，THEN THE Homepage SHALL 显示错误提示而非空白结果
