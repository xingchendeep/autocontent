# 需求文档：后台管理系统（Admin Panel）

## 简介

为 AutoContent Pro 构建一个后台管理系统，供管理员管理站点内容、用户、生成记录、平台模板、内容审核关键词、系统配置以及查看审计日志和运营数据。当前项目中不存在管理员角色机制，需要新增角色字段和权限校验。站点标题、描述、Hero 文案等内容目前硬编码在前端组件中，需要迁移到数据库驱动的动态配置。平台模板和屏蔽关键词同样硬编码在 TypeScript 常量中，需要支持后台在线编辑。

## 术语表

- **Admin_Panel**: 后台管理系统，仅限拥有 `admin` 或 `super_admin` 角色的用户访问
- **Admin_User**: 在 `profiles` 表中 `role` 字段值为 `admin` 或 `super_admin` 的已认证用户
- **Site_Settings_Service**: 负责读写 `site_settings` 键值表的服务层模块
- **User_Management_Service**: 负责用户列表查询、状态变更、订阅修改的服务层模块
- **Generation_Management_Service**: 负责全局生成记录查询和详情查看的服务层模块
- **Template_Management_Service**: 负责系统级平台模板 CRUD 的服务层模块
- **Moderation_Service**: 负责屏蔽关键词列表管理的服务层模块
- **Audit_Log_Viewer**: 审计日志查询和展示模块
- **Analytics_Dashboard**: 运营数据统计面板，展示 DAU、生成量、收入趋势等指标
- **System_Config_Service**: 负责速率限制阈值等系统级运行参数管理的服务层模块
- **RLS**: Supabase Row Level Security，行级安全策略

## 需求

### 需求 1：管理员角色与权限

**用户故事：** 作为系统所有者，我希望只有被授权的管理员才能访问后台管理系统，以保障系统安全。

#### 验收标准

1. THE Admin_Panel SHALL require authentication and verify that the current user has a `role` value of `admin` or `super_admin` in the `profiles` table before granting access
2. WHEN an unauthenticated user or a user without admin role accesses any Admin_Panel route, THE Admin_Panel SHALL redirect the user to the login page or return a 403 Forbidden response
3. THE Admin_Panel SHALL add a `role` column of type `varchar(20)` with a default value of `user` and a CHECK constraint allowing values `user`, `admin`, `super_admin` to the `profiles` table via a database migration
4. WHEN an Admin_User performs any write operation through the Admin_Panel, THE Admin_Panel SHALL record the action in the `audit_logs` table including the admin user ID, action type, resource type, and resource ID
5. THE Admin_Panel SHALL use the Supabase service role client to bypass RLS for all admin read and write operations on protected tables
6. WHILE a user has the `super_admin` role, THE Admin_Panel SHALL allow that user to promote or demote other users between `user` and `admin` roles
7. IF a non-super_admin Admin_User attempts to change another user's role, THEN THE Admin_Panel SHALL reject the request and return an error with code `INSUFFICIENT_PERMISSIONS`

### 需求 2：站点内容管理

**用户故事：** 作为管理员，我希望能在后台修改站点标题、描述、Hero 区域文案、版权信息等内容，而无需修改代码重新部署。

#### 验收标准

1. THE Site_Settings_Service SHALL store site configuration as key-value pairs in a `site_settings` table with columns `key` (varchar, primary key), `value` (text), `value_type` (varchar), and `updated_by` (uuid)
2. THE Admin_Panel SHALL provide a form to edit the following site settings: `site_title`, `site_description`, `hero_title`, `hero_description`, `copyright_text`, and `meta_keywords`
3. WHEN an Admin_User updates a site setting, THE Site_Settings_Service SHALL validate the `value` field is non-empty and does not exceed 2000 characters using Zod schema validation
4. WHEN a site setting is updated, THE Site_Settings_Service SHALL record the change in the `audit_logs` table with action `SITE_SETTING_UPDATED` and include the setting key and previous value in metadata
5. THE Admin_Panel SHALL display the current value of each setting in the edit form and show the last update timestamp and the admin who made the change
6. WHEN the front-end renders the Hero component or page metadata, THE Site_Settings_Service SHALL provide a server-side function that reads settings with a fallback to hardcoded default values if a key does not exist in the database

### 需求 3：用户管理

**用户故事：** 作为管理员，我希望能查看所有用户列表、搜索用户、查看用户详情、禁用或启用用户账户、以及查看和修改用户的订阅计划。

#### 验收标准

1. THE User_Management_Service SHALL return a paginated list of users with fields: user ID, email, display name, role, subscription plan name, generation count, registration date, and account status
2. WHEN an Admin_User provides a search keyword, THE User_Management_Service SHALL filter users by email or display name using case-insensitive partial matching
3. THE Admin_Panel SHALL support filtering the user list by role (`user`, `admin`, `super_admin`), subscription plan code, and account status (`active`, `disabled`)
4. WHEN an Admin_User views a user's detail page, THE Admin_Panel SHALL display the user's profile information, current subscription details, usage statistics, and the 10 most recent generation records
5. WHEN an Admin_User disables a user account, THE User_Management_Service SHALL set a `is_disabled` boolean field to `true` on the `profiles` table and record the action in `audit_logs` with action `USER_DISABLED`
6. WHEN a disabled user attempts to log in or make API requests, THE Admin_Panel SHALL reject the request and return an error with code `ACCOUNT_DISABLED`
7. WHEN an Admin_User changes a user's subscription plan, THE User_Management_Service SHALL update the `subscriptions` table and record the action in `audit_logs` with action `SUBSCRIPTION_ADMIN_CHANGED` including the old and new plan codes in metadata
8. THE Admin_Panel SHALL add an `is_disabled` boolean column with a default value of `false` to the `profiles` table via a database migration

### 需求 4：生成记录管理

**用户故事：** 作为管理员，我希望能查看全局的 AI 生成记录，按用户、平台、状态和时间范围筛选，以便监控系统使用情况和排查问题。

#### 验收标准

1. THE Generation_Management_Service SHALL return a paginated list of generation records with fields: generation ID, user email, input snippet (first 100 characters), platforms, status, model name, duration, and creation time
2. WHEN an Admin_User provides filter parameters, THE Generation_Management_Service SHALL support filtering by user ID, platform code, status (`success`, `partial`, `failed`), and date range (start date and end date)
3. WHEN an Admin_User views a generation detail page, THE Admin_Panel SHALL display the full input content, all platform results, token usage, error information (if any), and the associated user information
4. THE Generation_Management_Service SHALL support sorting the generation list by creation time, duration, or token usage in ascending or descending order
5. WHEN an Admin_User searches by keyword, THE Generation_Management_Service SHALL perform a case-insensitive search against the `input_content` field

### 需求 5：系统平台模板管理

**用户故事：** 作为管理员，我希望能在后台编辑系统级平台模板的提示词、字数限制和标签样式，而无需修改代码。

#### 验收标准

1. THE Template_Management_Service SHALL store system platform templates in a `system_templates` table with columns matching the existing `PlatformTemplate` interface: `platform` (varchar, primary key), `display_name`, `prompt_instructions` (text), `max_title_length` (integer), `max_content_length` (integer), `hashtag_style` (varchar), and `prompt_version` (varchar)
2. WHEN the Admin_Panel loads the template management page, THE Template_Management_Service SHALL display all 10 platform templates in a list with platform name, display name, prompt version, and last update time
3. WHEN an Admin_User edits a template, THE Admin_Panel SHALL provide a form with fields for display name, prompt instructions, max title length, max content length, hashtag style (select from `inline`, `trailing`, `none`), and prompt version
4. WHEN an Admin_User saves a template change, THE Template_Management_Service SHALL validate that `max_title_length` and `max_content_length` are non-negative integers and `prompt_instructions` is non-empty using Zod schema validation
5. WHEN a template is updated, THE Template_Management_Service SHALL record the change in `audit_logs` with action `TEMPLATE_UPDATED` and include the platform code and changed fields in metadata
6. WHEN the AI generation service needs a platform template, THE Template_Management_Service SHALL provide a function that reads from the `system_templates` table with a fallback to the hardcoded `PLATFORM_TEMPLATES` constant if the database record does not exist
7. THE Admin_Panel SHALL seed the `system_templates` table with the current hardcoded values from `PLATFORM_TEMPLATES` in the database migration

### 需求 6：审计日志查看

**用户故事：** 作为管理员，我希望能查看系统审计日志，按操作类型、用户和时间范围筛选，以便追踪系统操作和安全事件。

#### 验收标准

1. THE Audit_Log_Viewer SHALL return a paginated list of audit log entries with fields: log ID, user email (or "System" if user_id is null), action, resource type, resource ID, IP address, and creation time
2. WHEN an Admin_User provides filter parameters, THE Audit_Log_Viewer SHALL support filtering by action type, user ID, resource type, and date range (start date and end date)
3. WHEN an Admin_User clicks on a log entry, THE Audit_Log_Viewer SHALL display the full metadata JSON in a formatted view
4. THE Audit_Log_Viewer SHALL display log entries sorted by creation time in descending order by default
5. THE Audit_Log_Viewer SHALL extend the `AuditAction` type to include admin-specific actions: `SITE_SETTING_UPDATED`, `USER_DISABLED`, `USER_ENABLED`, `SUBSCRIPTION_ADMIN_CHANGED`, `TEMPLATE_UPDATED`, `KEYWORD_ADDED`, `KEYWORD_REMOVED`, `SYSTEM_CONFIG_UPDATED`, and `USER_ROLE_CHANGED`

### 需求 7：内容审核关键词管理

**用户故事：** 作为管理员，我希望能在后台添加、删除和查看屏蔽关键词列表，而无需修改代码。

#### 验收标准

1. THE Moderation_Service SHALL store blocked keywords in a `blocked_keywords` table with columns: `id` (uuid, primary key), `keyword` (varchar, unique), `category` (varchar), `created_by` (uuid), and `created_at` (timestamptz)
2. WHEN the Admin_Panel loads the keyword management page, THE Moderation_Service SHALL display all blocked keywords in a paginated list with keyword text, category, creator, and creation time
3. WHEN an Admin_User adds a new keyword, THE Moderation_Service SHALL validate that the keyword is non-empty, does not exceed 100 characters, and does not already exist in the table
4. WHEN a keyword is added, THE Moderation_Service SHALL record the action in `audit_logs` with action `KEYWORD_ADDED` and include the keyword text in metadata
5. WHEN a keyword is removed, THE Moderation_Service SHALL record the action in `audit_logs` with action `KEYWORD_REMOVED` and include the keyword text in metadata
6. WHEN the content moderation check runs, THE Moderation_Service SHALL read keywords from the `blocked_keywords` table with a fallback to the hardcoded `BLOCKED_KEYWORDS` array if the table is empty
7. THE Admin_Panel SHALL seed the `blocked_keywords` table with the current hardcoded values from `BLOCKED_KEYWORDS` in the database migration

### 需求 8：系统配置管理

**用户故事：** 作为管理员，我希望能在后台调整速率限制阈值和其他系统运行参数，而无需修改环境变量或重新部署。

#### 验收标准

1. THE System_Config_Service SHALL store system configuration in the `site_settings` table using a `system:` key prefix (e.g., `system:rate_limit_per_minute`, `system:max_input_length`, `system:max_platforms_per_request`)
2. THE Admin_Panel SHALL provide a form to edit system configuration values with input validation appropriate to each setting's `value_type` (integer, boolean, or string)
3. WHEN an Admin_User updates a system configuration value, THE System_Config_Service SHALL validate the value against the expected type and range constraints using Zod schema validation
4. WHEN a system configuration is updated, THE System_Config_Service SHALL record the change in `audit_logs` with action `SYSTEM_CONFIG_UPDATED` and include the setting key, old value, and new value in metadata
5. THE System_Config_Service SHALL provide a server-side function that reads system configuration with fallback to environment variables or hardcoded defaults if a key does not exist in the database

### 需求 9：运营数据面板

**用户故事：** 作为管理员，我希望能在后台看到关键运营指标的概览，包括日活用户数、生成量趋势、收入概况等，以便了解产品运营状况。

#### 验收标准

1. THE Analytics_Dashboard SHALL display the following summary cards: total registered users, today's active users (users with at least one generation today), total generations, and today's generation count
2. THE Analytics_Dashboard SHALL display a generation trend chart showing daily generation counts for the past 30 days
3. THE Analytics_Dashboard SHALL display a platform distribution chart showing the percentage of generations per platform for the past 30 days
4. THE Analytics_Dashboard SHALL display a table of the top 10 users by generation count in the current month with user email, generation count, and subscription plan
5. WHEN the Admin_Panel dashboard page loads, THE Analytics_Dashboard SHALL query aggregated data using the service role client and return results within 5 seconds for datasets up to 100,000 generation records
6. THE Analytics_Dashboard SHALL display a subscription distribution chart showing the count of active subscriptions per plan code

