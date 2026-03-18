# 需求文档

## 简介

本 spec 在现有 magic link / OTP 认证基础上，为 AutoContent Pro 新增邮箱+密码认证功能。
包括：用户注册（邮箱+密码）、邮箱+密码登录（作为主要登录方式）、忘记密码/重置密码流程，
以及登录页重构（邮箱密码登录为第一优先级，magic link 为第二优先级）。

本 spec 依赖 `user-authentication` spec 已完成的基础设施：Supabase Auth 集成、
服务端会话管理、Edge Middleware 路由保护、Auth Callback、Profile 自动创建等。
本 spec 不修改上述已有功能的核心逻辑，仅在其基础上扩展。

---

## 术语表

- **Auth_Service**：Supabase Auth 集成层（`src/lib/auth/`），负责发起登录、注册、登出及读取服务端会话。
- **Registration_Page**：位于 `/register` 的 Next.js 页面，渲染邮箱+密码注册表单。
- **Login_Page**：位于 `/login` 的 Next.js 页面，渲染登录表单，邮箱+密码为主要方式，magic link 为次要方式。
- **Forgot_Password_Page**：位于 `/forgot-password` 的 Next.js 页面，渲染密码重置请求表单。
- **Reset_Password_Page**：位于 `/reset-password` 的 Next.js 页面，渲染新密码设置表单。
- **Registration_Form**：`Registration_Page` 中的客户端交互组件，处理注册表单逻辑。
- **Login_Form**：`Login_Page` 中的客户端交互组件，处理登录表单逻辑。
- **Password_Validator**：密码强度校验模块，基于 Zod schema 实现。
- **Session**：存储在 HTTP-only cookie 中的 Supabase Auth 会话，代表一个已认证用户。

---

## 需求

### 需求 1：邮箱+密码注册

**用户故事：** 作为新用户，我希望通过邮箱和密码注册账户，这样我可以使用密码方式登录 AutoContent Pro。

#### 验收标准

1. Registration_Page 必须可通过路径 `/register` 访问。
2. Registration_Form 必须渲染邮箱输入框、密码输入框、确认密码输入框，以及提交按钮，每个输入框均带有关联的 `<label>` 元素。
3. WHEN 用户提交空邮箱或格式无效的邮箱时，Registration_Form 必须显示内联校验错误，且不得联系 Supabase Auth。
4. WHEN 用户提交的密码长度少于 8 个字符时，Registration_Form 必须显示内联校验错误，提示密码至少需要 8 个字符。
5. WHEN 用户提交的密码与确认密码不一致时，Registration_Form 必须显示内联校验错误，提示两次输入的密码不一致。
6. WHEN 用户提交有效的邮箱、符合要求的密码且两次密码一致时，Auth_Service 必须调用 Supabase Auth 的 `signUp` 方法创建新用户。
7. WHEN Supabase Auth 注册成功后，Registration_Page 必须显示确认信息，提示用户查收邮箱完成验证。
8. IF Supabase Auth 返回该邮箱已被注册的错误，THEN Registration_Form 必须显示用户可读的错误信息，提示该邮箱已被使用。
9. IF Supabase Auth 在注册过程中返回其他错误，THEN Registration_Form 必须显示用户可读的错误信息，并允许用户重试。
10. WHILE 注册请求进行中，Registration_Form 必须禁用提交按钮，防止重复提交。
11. Registration_Page 必须包含指向 `/login` 的链接，提示已有账户的用户前往登录。

---

### 需求 2：邮箱+密码登录

**用户故事：** 作为已注册用户，我希望通过邮箱和密码登录，这样我可以快速访问我的账户，无需等待邮件链接。

#### 验收标准

1. Login_Page 必须默认显示邮箱+密码登录表单作为主要登录方式。
2. Login_Form 必须在密码登录模式下渲染邮箱输入框、密码输入框和提交按钮，每个输入框均带有关联的 `<label>` 元素。
3. WHEN 用户提交空邮箱或格式无效的邮箱时，Login_Form 必须显示内联校验错误，且不得联系 Supabase Auth。
4. WHEN 用户提交空密码时，Login_Form 必须显示内联校验错误，提示请输入密码。
5. WHEN 用户提交有效的邮箱和密码时，Auth_Service 必须调用 Supabase Auth 的 `signInWithPassword` 方法进行认证。
6. WHEN 密码登录成功后，Auth_Service 必须建立 Session 并将用户重定向至 `/dashboard`。
7. IF Supabase Auth 返回凭据无效的错误，THEN Login_Form 必须显示用户可读的错误信息，提示邮箱或密码错误。
8. WHILE 登录请求进行中，Login_Form 必须禁用提交按钮，防止重复提交。
9. Login_Form 必须提供切换到 magic link 登录方式的入口，标记为次要选项。
10. Login_Page 必须包含指向 `/register` 的链接，提示新用户前往注册。
11. Login_Page 必须包含指向 `/forgot-password` 的链接，提示用户可以重置密码。

---

### 需求 3：Magic Link 登录（次要方式）

**用户故事：** 作为用户，我希望在不记得密码时可以切换到 magic link 方式登录，这样我仍然能够访问账户。

#### 验收标准

1. WHEN 用户在 Login_Form 中切换到 magic link 模式时，Login_Form 必须隐藏密码输入框，仅显示邮箱输入框和发送链接按钮。
2. WHEN 用户在 magic link 模式下提交有效邮箱时，Auth_Service 必须调用 Supabase Auth 的 `signInWithOtp` 方法发送登录链接。
3. WHEN magic link 发送成功后，Login_Form 必须显示确认信息，提示用户查收邮箱。
4. Login_Form 必须提供从 magic link 模式切换回密码登录模式的入口。

---

### 需求 4：忘记密码

**用户故事：** 作为忘记密码的用户，我希望通过邮箱请求密码重置，这样我可以重新获得账户访问权限。

#### 验收标准

1. Forgot_Password_Page 必须可通过路径 `/forgot-password` 访问。
2. Forgot_Password_Page 必须渲染邮箱输入框和提交按钮，邮箱输入框带有关联的 `<label>` 元素。
3. WHEN 用户提交空邮箱或格式无效的邮箱时，Forgot_Password_Page 必须显示内联校验错误，且不得联系 Supabase Auth。
4. WHEN 用户提交有效邮箱时，Auth_Service 必须调用 Supabase Auth 的 `resetPasswordForEmail` 方法，并将 `redirectTo` 设为 `/reset-password` 路径。
5. WHEN 密码重置邮件发送请求完成后，Forgot_Password_Page 必须显示确认信息，提示用户查收邮箱，无论该邮箱是否已注册（防止邮箱枚举攻击）。
6. WHILE 重置请求进行中，Forgot_Password_Page 必须禁用提交按钮，防止重复提交。
7. Forgot_Password_Page 必须包含返回 `/login` 的链接。

---

### 需求 5：重置密码

**用户故事：** 作为收到密码重置邮件的用户，我希望设置新密码，这样我可以使用新密码登录账户。

#### 验收标准

1. Reset_Password_Page 必须可通过路径 `/reset-password` 访问。
2. Reset_Password_Page 必须渲染新密码输入框、确认新密码输入框和提交按钮，每个输入框均带有关联的 `<label>` 元素。
3. WHEN 用户提交的新密码长度少于 8 个字符时，Reset_Password_Page 必须显示内联校验错误。
4. WHEN 用户提交的新密码与确认密码不一致时，Reset_Password_Page 必须显示内联校验错误。
5. WHEN 用户提交有效的新密码时，Auth_Service 必须调用 Supabase Auth 的 `updateUser` 方法更新密码。
6. WHEN 密码更新成功后，Reset_Password_Page 必须显示成功信息，并提供指向 `/login` 的链接引导用户登录。
7. IF Supabase Auth 在密码更新过程中返回错误，THEN Reset_Password_Page 必须显示用户可读的错误信息，并允许用户重试。
8. WHILE 密码更新请求进行中，Reset_Password_Page 必须禁用提交按钮，防止重复提交。

---

### 需求 6：密码校验规则

**用户故事：** 作为产品负责人，我希望密码有统一的强度要求，这样用户账户安全性得到基本保障。

#### 验收标准

1. Password_Validator 必须使用 Zod schema 实现，供注册和重置密码流程共用。
2. Password_Validator 必须要求密码长度至少为 8 个字符。
3. Password_Validator 必须要求密码包含至少一个字母和至少一个数字。
4. WHEN 密码不满足任一规则时，Password_Validator 必须返回具体的错误描述，说明哪条规则未满足。

---

### 需求 7：登录页重构

**用户故事：** 作为用户，我希望登录页清晰展示邮箱密码登录为主要方式，magic link 为备选方式，这样我能快速理解如何登录。

#### 验收标准

1. Login_Page 必须显示产品名称"AutoContent Pro"。
2. Login_Page 的默认视图必须展示邮箱+密码登录表单，密码输入框默认可见。
3. Login_Page 必须在密码登录表单下方提供"使用邮箱链接登录"的切换入口，视觉上标记为次要选项。
4. Login_Page 必须在表单区域下方提供"忘记密码？"链接，指向 `/forgot-password`。
5. Login_Page 必须在表单区域下方提供"没有账户？注册"链接，指向 `/register`。
6. Login_Page 应尽可能渲染为 Next.js Server Component，仅将交互式表单元素委托给 Client Component。
7. WHEN 用户浏览器禁用 JavaScript 时，Login_Page 必须显示提示信息，说明完成登录需要启用 JavaScript。

---

### 需求 8：注册页 UI

**用户故事：** 作为新用户，我希望注册页清晰易用，这样我能快速完成账户创建。

#### 验收标准

1. Registration_Page 必须显示产品名称"AutoContent Pro"和注册说明。
2. Registration_Page 应尽可能渲染为 Next.js Server Component，仅将交互式表单元素委托给 Client Component。
3. WHEN 用户浏览器禁用 JavaScript 时，Registration_Page 必须显示提示信息，说明完成注册需要启用 JavaScript。
4. Registration_Page 必须在表单区域下方提供"已有账户？登录"链接，指向 `/login`。

---

### 需求 9：路由保护扩展

**用户故事：** 作为产品负责人，我希望新增的认证页面也受到正确的路由保护，这样已登录用户不会看到注册或忘记密码页面。

#### 验收标准

1. WHEN 已认证用户访问 `/register` 时，Middleware 必须将用户重定向至 `/dashboard`。
2. WHEN 已认证用户访问 `/forgot-password` 时，Middleware 必须将用户重定向至 `/dashboard`。
3. WHEN 已认证用户访问 `/reset-password` 时，Middleware 必须允许请求继续（用户可能在已登录状态下修改密码）。
4. Middleware 的 matcher 配置必须更新以包含新增的认证路由。

---

### 需求 10：邮箱验证回调处理

**用户故事：** 作为新注册用户，我希望点击验证邮件中的链接后能自动完成登录，这样我无需再次手动输入凭据。

#### 验收标准

1. WHEN 新注册用户点击验证邮件中的链接时，现有的 Auth Callback 路由（`/auth/callback`）必须正确处理邮箱验证的 PKCE code exchange。
2. WHEN 邮箱验证成功后，Auth_Service 必须建立 Session 并调用 `upsertProfile` 创建用户 Profile，然后重定向至 `/dashboard`。
3. IF 邮箱验证链接无效或已过期，THEN Auth Callback 必须将用户重定向至 `/login?error=auth_failed`。
