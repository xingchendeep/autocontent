# 需求文档

## 简介

本 spec 涵盖 AutoContent Pro v1.0（第二阶段）的用户认证功能。
集成 Supabase Auth，提供基于邮箱的登录（magic link / OTP）、登出、
服务端会话管理、登录页 UI、受保护路由强制跳转，以及首次登录时自动创建用户 profile。

本阶段依赖第一阶段（supabase-infrastructure）已完成。`profiles` 表、
RLS 策略和所有迁移文件均已就位，本阶段不得重新设计。

本 spec 不包含：云端历史记录、使用统计、订阅支付，以及任何社交登录方式。

---

## 术语表

- **Auth_Service**：Supabase Auth 集成层（`src/lib/auth/`），负责发起登录、登出及读取服务端会话。
- **Session**：存储在 HTTP-only cookie 中的 Supabase Auth 会话，代表一个已认证用户。
- **Profile**：`public.profiles` 表中以 `auth.users.id` 为主键的一行记录，保存用户的显示偏好。
- **Login_Page**：位于 `/login` 的 Next.js 页面，渲染邮箱登录表单。
- **Dashboard**：位于 `/dashboard` 的 Next.js 页面组，仅限已认证用户访问。
- **Middleware**：Next.js Edge 中间件（`middleware.ts`），负责强制执行路由保护。
- **Magic_Link**：Supabase Auth 发送到用户邮箱的一次性登录链接。
- **OTP**：Supabase Auth 发送到用户邮箱的一次性数字验证码。

---

## 需求

### 需求 1：邮箱登录

**用户故事：** 作为内容创作者，我希望通过邮箱地址使用 magic link 或 OTP 登录，这样我无需管理密码即可访问账户。

#### 验收标准

1. Login_Page 必须渲染邮箱输入框和提交按钮。
2. 当用户提交有效邮箱地址时，Auth_Service 必须通过 Supabase Auth 向该地址发送 magic link 或 OTP。
3. 当用户提交空邮箱或格式无效的邮箱时，Login_Page 必须显示内联校验错误，且不得联系 Supabase Auth。
4. 当用户点击有效 magic link 或输入有效 OTP 时，Auth_Service 必须建立存储在 HTTP-only cookie 中的 Session。
5. 当 Session 成功建立后，Auth_Service 必须将用户重定向至 `/dashboard`。
6. 若 Supabase Auth 在登录过程中返回错误，Login_Page 必须显示用户可读的错误信息，并允许用户重试。
7. 在登录请求进行中时，Login_Page 必须禁用提交按钮，防止重复提交。

---

### 需求 2：登出

**用户故事：** 作为已认证用户，我希望能够登出账户，这样我的会话会被终止，在共享设备上数据得到保护。

#### 验收标准

1. Dashboard 必须向已认证用户展示可见的登出控件。
2. 当用户触发登出控件时，Auth_Service 必须调用 Supabase Auth 的登出方法并使 Session cookie 失效。
3. 当登出成功完成后，Auth_Service 必须将用户重定向至 `/login`。
4. 若 Supabase Auth 在登出过程中返回错误，Auth_Service 必须记录该错误，并仍然将用户重定向至 `/login`。

---

### 需求 3：服务端会话读取

**用户故事：** 作为开发者，我希望服务端从会话 cookie 中推导用户身份，这样客户端传入的用户 ID 永远不会被信任。

#### 验收标准

1. Auth_Service 必须暴露一个 `getSession` 辅助函数，通过 Supabase 服务端客户端从请求的 HTTP-only cookie 中读取 Session。
2. Auth_Service 不得接受请求体或查询字符串中提供的用户 ID 作为身份证明。
3. 当 `getSession` 被调用且请求携带有效、未过期的 Session cookie 时，Auth_Service 必须返回已认证用户的 UUID。
4. 当 `getSession` 被调用且请求不携带 Session cookie 或 Session 已过期时，Auth_Service 必须返回 `null`。
5. Auth_Service 必须使用 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 环境变量初始化服务端客户端；这些值不得暴露给浏览器。

---

### 需求 4：受保护路由

**用户故事：** 作为产品负责人，我希望未认证用户被重定向离开受保护页面，这样在没有有效会话的情况下，私有数据永远不会被渲染。

#### 验收标准

1. Middleware 必须拦截所有路径以 `/dashboard` 开头的请求。
2. 当 Middleware 拦截到 `/dashboard` 路径的请求且不存在有效 Session 时，Middleware 必须将请求重定向至 `/login`。
3. 当 Middleware 拦截到 `/dashboard` 路径的请求且存在有效 Session 时，Middleware 必须允许请求继续。
4. 当已认证用户访问 `/login` 时，Middleware 必须将用户重定向至 `/dashboard`。
5. Middleware 必须在 Edge 运行，且不得需要完整的服务器往返来评估会话有效性。

---

### 需求 5：首次登录时创建 Profile

**用户故事：** 作为新用户，我希望首次登录时自动创建 profile 记录，这样我的偏好设置无需单独注册步骤即可保存。

#### 验收标准

1. 当为 `id` 尚不存在于 `public.profiles` 的用户建立 Session 时，Auth_Service 必须向 `public.profiles` 插入一行新记录，`id` 等于 `auth.uid()`，`default_language` 设为 `'zh-CN'`。
2. 当为 `id` 已存在于 `public.profiles` 的用户建立 Session 时，Auth_Service 不得插入重复行。
3. Auth_Service 必须使用带 anon key 的 Supabase 服务端客户端执行 profile upsert，依赖 `profiles_insert_own` RLS 策略强制所有权。
4. 若 profile upsert 失败，Auth_Service 必须记录带 `requestId` 的错误，且不得阻止用户被重定向至 `/dashboard`。
5. 首次登录时创建的 Profile 行必须满足约束 `id = auth.uid()`，由 `profiles_insert_own` RLS 策略强制执行。

---

### 需求 6：登录页 UI

**用户故事：** 作为用户，我希望有一个清晰易用的登录页，这样我能理解如何登录以及提交邮箱后会发生什么。

#### 验收标准

1. Login_Page 必须可通过路径 `/login` 访问。
2. Login_Page 必须显示产品名称"AutoContent Pro"以及登录方式（magic link 或 OTP）的简要说明。
3. Login_Page 必须包含一个带有关联 `<label>` 元素的邮箱输入框。
4. 当登录成功且邮件已发送时，Login_Page 必须显示确认信息，提示用户查收收件箱。
5. Login_Page 应尽可能渲染为 Next.js Server Component，仅将交互式表单元素委托给 Client Component。
6. 当用户浏览器禁用 JavaScript 时，Login_Page 必须显示提示信息，说明完成登录需要启用 JavaScript。

---

### 需求 7：会话持久化与过期

**用户故事：** 作为已认证用户，我希望会话在 token 有效期内跨页面刷新和浏览器重启持续存在，这样我不必反复登录。

#### 验收标准

1. Auth_Service 必须将 Session 存储在由 Supabase SSR 客户端管理的 HTTP-only、`Secure`、`SameSite=Lax` cookie 中。
2. 在有效 Session cookie 存在期间，Auth_Service 必须在 access token 过期前自动刷新，无需用户操作。
3. 当 refresh token 本身过期或被撤销时，Auth_Service 必须将 Session 视为无效，并从 `getSession` 返回 `null`。
4. Auth_Service 不得将 access token 或 refresh token 存储在 `localStorage` 或 `sessionStorage` 中。
