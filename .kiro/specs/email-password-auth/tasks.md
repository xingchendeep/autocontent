# 实施计划：邮箱+密码认证

## 概述

在现有 magic link 认证基础上，新增邮箱+密码注册、密码登录（主要方式）、忘记密码/重置密码流程，并重构登录页 UI。任务按顺序编排：校验层 → Auth 服务扩展 → 页面与组件 → 路由保护 → 集成验证。

## Tasks

- [ ] 1. 创建密码校验 Schema 和表单校验模块
  - [x] 1.1 创建 `src/lib/validations/auth.ts`
    - 实现 `emailSchema`、`passwordSchema`（≥8字符 + 至少1字母 + 至少1数字）
    - 实现 `registerFormSchema`（含 confirmPassword refine）
    - 实现 `loginFormSchema`、`forgotPasswordFormSchema`、`resetPasswordFormSchema`
    - 导出所有 schema 及对应的 TypeScript 类型
    - 错误信息使用中文
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 1.3, 1.4, 1.5, 2.3, 2.4, 4.3, 5.3, 5.4_

  - [ ]* 1.2 编写属性测试：Property 1 — 无效邮箱一律被拒绝
    - **Property 1: 无效邮箱一律被拒绝**
    - **Validates: Requirements 1.3, 2.3, 4.3**
    - 文件：`tests/property/email-password-auth.property.test.ts`
    - 使用 `fc.string()` 过滤掉合法邮箱，验证 `emailSchema.safeParse` 返回 `success: false`
    - 最少 100 次迭代

  - [ ]* 1.3 编写属性测试：Property 2 — 密码强度规则全面校验
    - **Property 2: 密码强度规则全面校验**
    - **Validates: Requirements 1.4, 5.3, 6.2, 6.3, 6.4**
    - 文件：`tests/property/email-password-auth.property.test.ts`
    - 使用 `fc.string()` 分类测试（短字符串、纯数字、纯字母、混合），验证 `passwordSchema` 按规则接受/拒绝
    - 最少 100 次迭代

  - [ ]* 1.4 编写属性测试：Property 3 — 密码确认不一致一律被拒绝
    - **Property 3: 密码确认不一致一律被拒绝**
    - **Validates: Requirements 1.5, 5.4**
    - 文件：`tests/property/email-password-auth.property.test.ts`
    - 使用 `fc.tuple(fc.string(), fc.string()).filter(([a, b]) => a !== b)`，验证 `registerFormSchema` 和 `resetPasswordFormSchema` 拒绝
    - 最少 100 次迭代

- [ ] 2. 实现注册表单组件和注册页面
  - [x] 2.1 创建 `src/components/auth/RegistrationForm.tsx`（Client Component）
    - 渲染邮箱、密码、确认密码输入框，每个带 `<label>` 元素
    - 使用 `registerFormSchema` 进行前端 Zod 校验，校验失败显示内联错误且不联系 Supabase
    - 调用 `supabase.auth.signUp({ email, password })` 创建用户
    - 管理 UI 状态机：idle → loading → success | error
    - loading 状态禁用提交按钮防止重复提交
    - 成功后显示"请查收邮箱完成验证"确认信息
    - 处理"邮箱已被注册"和其他 Supabase 错误，显示中文用户可读信息
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

  - [x] 2.2 创建 `src/app/(auth)/register/page.tsx`（Server Component）
    - 显示产品名称"AutoContent Pro"和注册说明
    - 渲染 `<RegistrationForm />` 客户端组件
    - 包含 `<noscript>` 提示信息
    - 包含指向 `/login` 的"已有账户？登录"链接
    - _Requirements: 1.1, 1.11, 8.1, 8.2, 8.3, 8.4_

  - [ ]* 2.3 编写 RegistrationForm 单元测试
    - 验证渲染必要元素（输入框、label、按钮）
    - 验证校验错误显示（空邮箱、短密码、密码不一致）
    - 验证 loading 状态禁用按钮
    - 验证成功状态显示确认信息
    - 文件：`tests/unit/components/auth/RegistrationForm.test.tsx`
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.10_

- [ ] 3. 重构登录表单和登录页面
  - [x] 3.1 重构 `src/components/auth/LoginForm.tsx`
    - 将 `authMode` 默认值从 `'magic-link'` 改为 `'password'`
    - 密码登录模式下使用 `loginFormSchema` 进行 Zod 校验（邮箱格式 + 密码非空）
    - 密码登录模式下渲染邮箱、密码输入框和提交按钮，每个带 `<label>`
    - 密码登录成功后建立 Session 并重定向至 `/dashboard`
    - 处理 `Invalid login credentials` 错误，显示"邮箱或密码错误，请重试"
    - 在密码登录表单下方添加"使用邮箱链接登录"切换入口（次要样式）
    - 保留 magic link 模式切换功能及其完整流程
    - loading 状态禁用提交按钮
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 更新 `src/app/(auth)/login/page.tsx`
    - 更新描述文案为"登录您的账户"（不再是"发送免密登录链接"）
    - 添加指向 `/register` 的"没有账户？注册"链接
    - 添加指向 `/forgot-password` 的"忘记密码？"链接
    - 保留 `<noscript>` 提示和产品名称
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7_

  - [ ]* 3.3 编写 LoginForm 单元测试
    - 验证默认显示密码登录模式
    - 验证模式切换功能
    - 验证校验错误显示
    - 验证登录成功重定向
    - 文件：`tests/unit/components/auth/LoginForm.test.tsx`
    - _Requirements: 2.1, 2.2, 2.7, 2.9_

- [x] 4. Checkpoint — 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. 实现忘记密码流程
  - [x] 5.1 创建 `src/components/auth/ForgotPasswordForm.tsx`（Client Component）
    - 渲染邮箱输入框和提交按钮，邮箱输入框带 `<label>`
    - 使用 `forgotPasswordFormSchema` 进行 Zod 校验，校验失败不联系 Supabase
    - 调用 `supabase.auth.resetPasswordForEmail(email, { redirectTo: '/reset-password' })`
    - 无论邮箱是否存在，均显示相同确认信息（防邮箱枚举）
    - loading 状态禁用提交按钮
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 5.2 创建 `src/app/(auth)/forgot-password/page.tsx`（Server Component）
    - 渲染 `<ForgotPasswordForm />` + `<noscript>` 提示
    - 包含返回 `/login` 的链接
    - _Requirements: 4.1, 4.7_

  - [ ]* 5.3 编写属性测试：Property 4 — 密码重置请求不泄露邮箱注册状态
    - **Property 4: 密码重置请求不泄露邮箱注册状态**
    - **Validates: Requirements 4.5**
    - 文件：`tests/property/email-password-auth.property.test.ts`
    - 使用 `fc.emailAddress()` 生成随机邮箱，验证 UI 响应一致
    - 最少 100 次迭代

  - [ ]* 5.4 编写 ForgotPasswordForm 单元测试
    - 验证校验错误显示
    - 验证成功确认信息
    - 验证 anti-enumeration（相同确认信息）
    - 文件：`tests/unit/components/auth/ForgotPasswordForm.test.tsx`
    - _Requirements: 4.3, 4.5, 4.6_

- [ ] 6. 实现重置密码流程
  - [x] 6.1 创建 `src/components/auth/ResetPasswordForm.tsx`（Client Component）
    - 渲染新密码、确认新密码输入框和提交按钮，每个带 `<label>`
    - 使用 `resetPasswordFormSchema` 进行 Zod 校验
    - 调用 `supabase.auth.updateUser({ password })` 更新密码
    - 成功后显示成功信息 + 指向 `/login` 的链接
    - 处理 Supabase 错误，显示用户可读信息并允许重试
    - loading 状态禁用提交按钮
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 6.2 创建 `src/app/(auth)/reset-password/page.tsx`（Server Component）
    - 渲染 `<ResetPasswordForm />` + `<noscript>` 提示
    - _Requirements: 5.1_

  - [ ]* 6.3 编写 ResetPasswordForm 单元测试
    - 验证校验错误显示（短密码、密码不一致）
    - 验证成功状态显示
    - 验证错误重试
    - 文件：`tests/unit/components/auth/ResetPasswordForm.test.tsx`
    - _Requirements: 5.3, 5.4, 5.7_

- [ ] 7. 扩展路由保护（Middleware）
  - [x] 7.1 更新 `middleware.ts`
    - matcher 新增 `'/register'`、`'/forgot-password'`
    - 已认证用户访问 `/register`、`/forgot-password` → 重定向 `/dashboard`
    - `/reset-password` 不做重定向（已登录用户可能在修改密码）
    - 保留现有 `/dashboard` 和 `/login` 的保护逻辑不变
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 7.2 编写属性测试：Property 5 — 已认证用户访问仅游客路由被重定向
    - **Property 5: 已认证用户访问仅游客路由被重定向**
    - **Validates: Requirements 9.1, 9.2**
    - 文件：`tests/property/email-password-auth.property.test.ts`
    - 使用 `fc.constantFrom('/login', '/register', '/forgot-password')` 生成路由
    - 最少 100 次迭代

  - [ ]* 7.3 编写 Middleware 单元测试
    - 验证已认证用户访问 `/register`、`/forgot-password` 被重定向
    - 验证 `/reset-password` 不被重定向
    - 文件：`tests/unit/middleware.test.ts`
    - _Requirements: 9.1, 9.2, 9.3_

- [ ] 8. 验证邮箱验证回调处理
  - [x] 8.1 验证现有 `/auth/callback` 路由正确处理邮箱验证 PKCE code exchange
    - 确认注册验证邮件链接经过 `/auth/callback` 后能正确建立 Session
    - 确认 `upsertProfile` 被调用创建用户 Profile
    - 确认成功后重定向至 `/dashboard`
    - 确认无效/过期链接重定向至 `/login?error=auth_failed`
    - 如需修改则更新 `src/app/auth/callback/route.ts`
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 9. Final checkpoint — 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 标记 `*` 的子任务为可选，可跳过以加速 MVP 交付
- 每个任务引用具体需求编号以确保可追溯性
- 属性测试统一放在 `tests/property/email-password-auth.property.test.ts`
- 属性测试使用 fast-check 库，每个属性最少 100 次迭代
- 本 spec 不新增数据库表，所有认证数据由 Supabase Auth 管理
- 复用现有 Auth 基础设施：`createSupabaseBrowserClient`、`createSupabaseServerClient`、`getSession`、`upsertProfile`、Auth Callback
