# 实现任务：后台管理系统（Admin Panel）

## 任务 1：数据库迁移 — 管理员角色、站点设置、系统模板、屏蔽关键词

- [x] 创建 `supabase/migrations/20260318000000_admin_panel.sql`
- [x] ALTER `profiles` 表添加 `role varchar(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','super_admin'))` 字段
- [x] ALTER `profiles` 表添加 `is_disabled boolean NOT NULL DEFAULT false` 字段
- [x] 创建 `site_settings` 表（key, value, value_type, updated_by, updated_at）
- [x] 插入站点设置种子数据（site_title, site_description, hero_title, hero_description, copyright_text, meta_keywords）
- [x] 插入系统配置种子数据（system:rate_limit_per_minute, system:max_input_length, system:max_platforms_per_request）
- [x] 创建 `system_templates` 表（platform, display_name, prompt_instructions, max_title_length, max_content_length, hashtag_style, prompt_version, updated_by, updated_at）
- [x] 从 `PLATFORM_TEMPLATES` 常量插入 10 个平台的种子数据
- [x] 创建 `blocked_keywords` 表（id, keyword, category, created_by, created_at）及唯一索引
- [x] 从 `BLOCKED_KEYWORDS` 常量插入种子数据
- [x] 为 site_settings、system_templates、blocked_keywords 启用 RLS，system_templates 添加 SELECT true 策略
- [x] 验证 migration SQL 语法正确，使用 BEGIN/COMMIT 事务包裹

**References: Requirements 1.3, 1.8, 2.1, 5.1, 5.7, 7.1, 7.7, 8.1**

## 任务 2：管理员鉴权守卫 + 错误码扩展 + 审计日志 Action 扩展

- [x] 创建 `src/lib/admin/auth.ts`，实现 `requireAdmin()` 和 `requireSuperAdmin()` 函数
- [x] `requireAdmin()` 调用 `getSession()` + service role 查询 profiles.role 和 is_disabled
- [x] is_disabled 为 true 时抛出 ACCOUNT_DISABLED 错误
- [x] role 不是 admin/super_admin 时抛出 FORBIDDEN 错误
- [x] 在 `src/lib/errors/index.ts` 中添加 `ACCOUNT_DISABLED`(403) 和 `INSUFFICIENT_PERMISSIONS`(403) 错误码
- [x] 在 `src/lib/db/audit-logger.ts` 的 `AuditAction` 类型中添加 9 个新 action
- [x] 在 `middleware.ts` 的 matcher 中添加 `/admin/:path*` 路由保护
- [x] 创建 `src/lib/admin/` 目录下的 Zod 校验 schema 文件 `src/lib/validations/admin.ts`

**References: Requirements 1.1, 1.2, 1.4, 1.5, 3.6, 6.5**

## 任务 3：站点设置服务 + API 路由

- [x] 创建 `src/lib/admin/site-settings.ts`，实现 `getAllSiteSettings()`, `updateSiteSettings()`, `getSiteSettingWithDefault()`
- [x] 所有读写使用 `createServiceRoleClient()`
- [x] 更新时先读取旧值，写入审计日志（SITE_SETTING_UPDATED）后再更新
- [x] Zod 校验：value 非空且 ≤ 2000 字符
- [x] 创建 `src/app/api/admin/settings/route.ts`（GET + PUT）
- [x] GET 返回所有非 `system:` 前缀的设置
- [x] PUT 接收 `{ settings: Array<{ key, value }> }` 批量更新
- [x] 两个路由入口均调用 `requireAdmin()`

**References: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

## 任务 4：用户管理服务 + API 路由

- [x] 创建 `src/lib/admin/users.ts`，实现 `listUsers()`, `getUserDetail()`, `updateUserStatus()`, `updateUserRole()`, `updateUserSubscription()`
- [x] `listUsers()` 联合查询 profiles + usage_stats + current_active_subscriptions，支持分页、搜索（ilike）、角色/计划/状态筛选
- [x] `getUserDetail()` 返回用户信息 + 订阅详情 + 使用统计 + 最近 10 条生成记录
- [x] `updateUserRole()` 校验当前管理员为 super_admin，否则返回 INSUFFICIENT_PERMISSIONS
- [x] 创建 `src/app/api/admin/users/route.ts`（GET 列表）
- [x] 创建 `src/app/api/admin/users/[id]/route.ts`（GET 详情 + PATCH 状态/角色）
- [x] 创建 `src/app/api/admin/users/[id]/subscription/route.ts`（PATCH 订阅）
- [x] 所有写操作记录审计日志

**References: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 1.6, 1.7**

## 任务 5：生成记录管理服务 + API 路由

- [x] 创建 `src/lib/admin/generations.ts`，实现 `listGenerations()`, `getGenerationDetail()`
- [x] 支持按 userId、platform（数组包含）、status、日期范围筛选
- [x] 支持按 created_at、duration_ms、tokens_input 排序
- [x] 支持 input_content ilike 关键词搜索
- [x] 创建 `src/app/api/admin/generations/route.ts`（GET 列表）
- [x] 创建 `src/app/api/admin/generations/[id]/route.ts`（GET 详情）

**References: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

## 任务 6：系统模板管理服务 + API 路由

- [x] 创建 `src/lib/admin/templates.ts`，实现 `listSystemTemplates()`, `updateSystemTemplate()`, `getSystemTemplate()`
- [x] `getSystemTemplate()` 先查数据库，无记录回退到 `PLATFORM_TEMPLATES` 常量
- [x] 更新时 Zod 校验 maxTitleLength/maxContentLength ≥ 0，promptInstructions 非空
- [x] 更新时记录变更字段到审计日志 metadata
- [x] 创建 `src/app/api/admin/templates/route.ts`（GET 列表）
- [x] 创建 `src/app/api/admin/templates/[platform]/route.ts`（PUT 更新）

**References: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**

## 任务 7：审计日志查看 API 路由

- [x] 创建 `src/app/api/admin/audit-logs/route.ts`（GET）
- [x] 支持按 action、userId、resourceType、日期范围筛选
- [x] 默认按 created_at DESC 排序
- [x] 联合查询 profiles 获取 user email（user_id 为 null 时显示 "System"）
- [x] 分页返回，默认 pageSize 50

**References: Requirements 6.1, 6.2, 6.3, 6.4**

## 任务 8：关键词管理服务 + API 路由

- [x] 创建 `src/lib/admin/keywords.ts`，实现 `listKeywords()`, `addKeyword()`, `removeKeyword()`, `getAllBlockedKeywords()`
- [x] `getAllBlockedKeywords()` 先查数据库，表为空回退到 `BLOCKED_KEYWORDS` 常量
- [x] 添加时捕获 unique constraint 错误返回 INVALID_INPUT
- [x] 创建 `src/app/api/admin/keywords/route.ts`（GET 列表 + POST 添加）
- [x] 创建 `src/app/api/admin/keywords/[id]/route.ts`（DELETE 删除）
- [x] 所有增删操作记录审计日志

**References: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**

## 任务 9：系统配置服务 + API 路由

- [x] 创建 `src/lib/admin/system-config.ts`，实现 `listSystemConfigs()`, `updateSystemConfigs()`, `getSystemConfig()`, `getSystemConfigInt()`
- [x] 复用 site_settings 表，key 使用 `system:` 前缀
- [x] 更新时根据 value_type 校验值格式（integer 为有效数字，boolean 为 true/false）
- [x] 创建 `src/app/api/admin/system-config/route.ts`（GET + PUT）
- [x] 更新时记录审计日志（含 old/new value）

**References: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

## 任务 10：运营数据服务 + API 路由

- [x] 创建 `src/lib/admin/analytics.ts`，实现 `getSummary()`, `getGenerationTrends()`, `getPlatformDistribution()`, `getTopUsers()`, `getSubscriptionDistribution()`
- [x] `getSummary()` 使用 COUNT 聚合查询总用户数、今日活跃、总生成数、今日生成数
- [x] `getGenerationTrends()` 使用 DATE_TRUNC 按天分组统计过去 30 天
- [x] `getPlatformDistribution()` 使用 UNNEST(platforms) 展开后分组统计
- [x] `getTopUsers()` 联合 generations + profiles 查询本月 Top 10
- [x] `getSubscriptionDistribution()` 查询 current_active_subscriptions 视图按 plan_code 分组
- [x] 创建 `src/app/api/admin/analytics/summary/route.ts`
- [x] 创建 `src/app/api/admin/analytics/trends/route.ts`
- [x] 创建 `src/app/api/admin/analytics/platforms/route.ts`
- [x] 创建 `src/app/api/admin/analytics/top-users/route.ts`
- [x] 创建 `src/app/api/admin/analytics/subscriptions/route.ts`

**References: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6**

## 任务 11：Admin 前端布局 + 运营数据面板页面

- [x] 创建 `src/app/admin/layout.tsx`（Server Component，鉴权 + AdminLayout 包裹）
- [x] 创建 `src/components/admin/AdminLayout.tsx`（侧边导航 + 顶栏）
- [x] 创建 `src/components/admin/AdminNav.tsx`（导航菜单：概览、站点设置、用户、生成记录、模板、关键词、审计日志、系统配置）
- [x] 创建 `src/app/admin/page.tsx`（运营数据面板首页）
- [x] 创建 `src/components/admin/AnalyticsSummary.tsx`（4 个概览卡片）
- [x] 创建 `src/components/admin/AnalyticsCharts.tsx`（趋势图 + 平台分布 + 订阅分布）
- [x] 在 middleware.ts matcher 中确认 `/admin/:path*` 已添加

**References: Requirements 9.1, 9.2, 9.3, 9.6**

## 任务 12：站点设置管理页面

- [x] 创建 `src/app/admin/settings/page.tsx`
- [x] 创建 `src/components/admin/SiteSettingsForm.tsx`（编辑表单，显示当前值、更新时间、更新者）
- [x] 调用 `GET /api/admin/settings` 加载数据
- [x] 提交调用 `PUT /api/admin/settings` 批量更新
- [x] 成功/失败 Toast 提示

**References: Requirements 2.2, 2.5**

## 任务 13：用户管理页面

- [x] 创建 `src/app/admin/users/page.tsx`（用户列表）
- [x] 创建 `src/components/admin/UserTable.tsx`（表格 + 搜索 + 筛选 + 分页）
- [x] 创建 `src/app/admin/users/[id]/page.tsx`（用户详情）
- [x] 创建 `src/components/admin/UserDetail.tsx`（用户信息 + 订阅 + 使用统计 + 最近生成记录）
- [x] 支持禁用/启用用户、修改角色（super_admin 可见）、修改订阅计划
- [x] 操作前使用 ConfirmDialog 确认

**References: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.7**

## 任务 14：生成记录管理页面

- [x] 创建 `src/app/admin/generations/page.tsx`（生成记录列表）
- [x] 创建 `src/components/admin/GenerationTable.tsx`（表格 + 筛选 + 排序 + 分页）
- [x] 创建 `src/app/admin/generations/[id]/page.tsx`（生成记录详情）
- [x] 创建 `src/components/admin/GenerationDetail.tsx`（完整输入、平台结果、token 用量、用户信息）

**References: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

## 任务 15：系统模板管理 + 关键词管理 + 审计日志 + 系统配置页面

- [x] 创建 `src/app/admin/templates/page.tsx` + `src/components/admin/TemplateEditor.tsx`
- [x] 创建 `src/app/admin/keywords/page.tsx` + `src/components/admin/KeywordManager.tsx`
- [x] 创建 `src/app/admin/audit-logs/page.tsx` + `src/components/admin/AuditLogTable.tsx`
- [x] 创建 `src/app/admin/system-config/page.tsx` + `src/components/admin/SystemConfigForm.tsx`
- [x] 模板编辑支持 promptInstructions 多行文本、hashtagStyle 下拉选择
- [x] 关键词管理支持添加（含 category 选择）和删除（含确认）
- [x] 审计日志支持点击展开 metadata JSON
- [x] 系统配置根据 value_type 渲染不同输入控件

**References: Requirements 5.2, 5.3, 6.1, 6.2, 6.3, 7.2, 7.3, 8.2**

## 任务 16：现有服务集成 — 回退读取

- [x] 修改 `src/components/layout/Hero.tsx` 为 Server Component，使用 `getSiteSettingWithDefault()` 读取 hero_title 和 hero_description
- [x] 修改 `src/app/layout.tsx` 的 metadata 使用 `getSiteSettingWithDefault()` 读取 site_title 和 site_description
- [x] 修改 AI 生成服务中获取平台模板的逻辑，优先从 `getSystemTemplate()` 读取
- [x] 修改内容审核服务中获取关键词的逻辑，优先从 `getAllBlockedKeywords()` 读取
- [x] 修改速率限制相关逻辑，使用 `getSystemConfigInt()` 读取阈值
- [x] 确保所有回退逻辑在数据库不可用时不影响正常功能

**References: Requirements 2.6, 5.6, 7.6, 8.5**

## 任务 17：Admin 类型定义 + 通用组件

- [x] 在 `src/types/admin.ts` 中定义所有 Admin 相关类型（AdminUserItem, AdminUserDetail, SiteSetting, SystemTemplate, BlockedKeywordItem, SystemConfigItem, AnalyticsSummary, DailyTrend, PlatformDistribution, TopUser, SubscriptionDistribution 等）
- [x] 创建 `src/components/admin/Pagination.tsx` 通用分页组件
- [x] 创建 `src/components/admin/DataTable.tsx` 通用数据表格组件
- [x] 创建 `src/components/admin/FilterBar.tsx` 通用筛选栏组件
- [x] 创建 `src/hooks/useAdminApi.ts` 封装 Admin API 调用的通用 hook

**References: Design 6.2**
