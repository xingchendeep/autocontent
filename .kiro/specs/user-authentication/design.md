# 设计文档：用户认证

## 概述

本文档描述 AutoContent Pro 用户认证功能（第二阶段）的技术设计。
涵盖通过 Supabase Auth magic link / OTP 实现的邮箱登录、登出、服务端会话管理、
通过 Next.js Edge Middleware 实现的受保护路由强制跳转，以及首次登录时自动创建 profile。

本设计基于第一阶段 `supabase-infrastructure` spec。`public.profiles` 表、
RLS 策略（`profiles_select_own`、`profiles_insert_own`、`profiles_update_own`）
及所有迁移文件均已就位，本阶段不重新设计。

### 核心设计目标

- Session 完全存储在由 `@supabase/ssr` 管理的 HTTP-only cookie 中，永远不使用 `localStorage` 或 `sessionStorage`。
- 用户身份始终从服务端的 session cookie 中推导；客户端传入的用户 ID 永远不被信任。
- 路由保护在 Edge（middleware）运行，确保未认证请求永远不会渲染受保护页面。
- Profile upsert 为非阻塞操作：失败时记录错误，但不阻止用户到达 `/dashboard`。

---

## 架构

```
浏览器
  │
  ├─ GET /login          → (auth)/login/page.tsx  [Server Component]
  │                           └─ LoginForm.tsx     [Client Component]
  │
  ├─ POST /auth/callback → app/auth/callback/route.ts
  │                           └─ exchangeCodeForSession → upsertProfile → 重定向 /dashboard
  │
  ├─ GET /dashboard/*    → middleware.ts (Edge)
  │                           ├─ 无 session  → 重定向 /login
  │                           └─ 有 session → next()
  │
  └─ POST /api/signout   → app/api/signout/route.ts（或 Server Action）
                              └─ supabase.auth.signOut() → 重定向 /login
```

### Supabase SSR 客户端变体

由于每种运行时上下文的 cookie 访问方式不同，需要三种不同的 Supabase 客户端工厂：

| 上下文 | 工厂函数 | Cookie 访问方式 |
|---|---|---|
| Server Components / Route Handlers | `createServerClient`（只读 cookie） | `next/headers` 的 `cookies()` |
| Middleware | `createServerClient`（读写 cookie） | `request`/`response` headers |
| Client Components | `createBrowserClient` | 浏览器 cookie jar |

---

## 组件与接口

### 文件结构

```
src/
  app/
    (auth)/
      login/
        page.tsx              # Server Component 外壳 — 渲染 LoginForm
    auth/
      callback/
        route.ts              # 处理 magic link / OTP code 交换
    api/
      signout/
        route.ts              # POST — 调用 supabase.auth.signOut()
    dashboard/
      layout.tsx              # 服务端读取 session，渲染登出控件
      page.tsx
  components/
    auth/
      LoginForm.tsx           # 'use client' — 邮箱输入、提交、loading、错误状态
  lib/
    auth/
      client.ts               # createBrowserClient()
      server.ts               # createServerClient()，用于 Server Components / Route Handlers
      middleware-client.ts    # createServerClient()，用于 middleware（修改 response cookies）
      index.ts                # 导出 getSession、signOut、upsertProfile
middleware.ts                 # 根目录 Edge middleware
```

### `src/lib/auth/server.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}
```

### `src/lib/auth/middleware-client.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';

export function createSupabaseMiddlewareClient(
  request: NextRequest,
  response: NextResponse
) {
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}
```

### `src/lib/auth/client.ts`

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

> 注意：`NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 是可公开的变体。
> anon key 可以暴露，它不是密钥。service role key 永远不在客户端使用。

### `src/lib/auth/index.ts`

```typescript
export async function getSession(/* 内部使用 createSupabaseServerClient */)
  : Promise<{ id: string; email: string } | null>

export async function signOut(): Promise<void>
  // 调用 supabase.auth.signOut()，然后 redirect('/login')

export async function upsertProfile(userId: string, requestId: string): Promise<void>
  // upsert 到 public.profiles，onConflict: 'id'
  // 失败时记录错误，永不抛出异常
```

### `middleware.ts`（根目录）

```typescript
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createSupabaseMiddlewareClient(request, response);

  // 调用 getUser() 会触发 token 刷新并将更新后的 cookie 写入 response
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/dashboard') && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
```

### `app/auth/callback/route.ts`

```typescript
// GET /auth/callback?code=...
// 将 PKCE code 交换为 session，upsert profile，重定向至 /dashboard
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  if (code) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await upsertProfile(data.user.id, generateRequestId());
    }
  }
  return NextResponse.redirect(new URL('/dashboard', request.url));
}
```

### `components/auth/LoginForm.tsx`

Client Component，负责：
- 带客户端校验的受控邮箱输入（Zod `z.string().email()`）
- 调用 `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: '/auth/callback' } })`
- 管理四种 UI 状态：`idle` | `loading` | `sent` | `error`
- `loading` 期间禁用提交按钮
- `sent` 时渲染确认信息
- `error` 时渲染错误信息

---

## 数据模型

### Session（由 `@supabase/ssr` 管理）

Session 不存储在应用代码中。`@supabase/ssr` 管理以下 cookie：

| Cookie 名称 | 内容 | 属性 |
|---|---|---|
| `sb-<project>-auth-token` | JWT access token + refresh token（过大时分块） | `HttpOnly; Secure; SameSite=Lax; Path=/` |

使用上述 cookie 适配器的 `createServerClient` 时，`@supabase/ssr` 会自动设置 cookie 属性。

### Profile 行（第一阶段 schema，本阶段只读）

```sql
public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_language text NOT NULL DEFAULT 'zh-CN',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
)
```

`upsertProfile` 函数执行：

```typescript
await supabase
  .from('profiles')
  .upsert({ id: userId, default_language: 'zh-CN' }, { onConflict: 'id' });
```

`profiles_insert_own` RLS 策略（`id = auth.uid()`）确保用户只能为自己插入行。
`onConflict: 'id'` 使操作具有幂等性。

### 认证相关类型（`src/types/index.ts` 新增）

```typescript
export interface AuthUser {
  id: string;       // 来自 auth.users 的 UUID
  email: string;
}

export interface AuthSession {
  user: AuthUser;
  expiresAt: number; // Unix 时间戳
}
```

---

## 正确性属性

*属性是在系统所有有效执行中都应成立的特征或行为——本质上是对系统应做什么的形式化陈述。
属性是连接人类可读规范与机器可验证正确性保证的桥梁。*

### 属性 1：无效邮箱始终被拒绝

*对于任意*不是语法上有效的 RFC 5322 邮箱地址的字符串，`LoginForm` 校验函数必须返回错误，
且不得调用 Supabase `signInWithOtp` 方法。

**验证：需求 1.3**

---

### 属性 2：有效邮箱始终触发登录尝试

*对于任意*提交到 `LoginForm` 的语法上有效的邮箱地址，Supabase `signInWithOtp` 方法
必须被调用恰好一次，且使用该邮箱地址。

**验证：需求 1.2**

---

### 属性 3：登出始终重定向至 /login

*对于任意*先前的认证状态（已认证或已登出），调用 `signOut` 必须导致重定向至 `/login`，
无论 Supabase `signOut` 调用成功还是返回错误。

**验证：需求 2.2、2.3、2.4**

---

### 属性 4：getSession 对无有效 session 的请求返回 null

*对于任意*不携带 session cookie、携带过期 session cookie 或 refresh token 已被撤销的
HTTP 请求，`getSession` 必须返回 `null`。

**验证：需求 3.4、7.3**

---

### 属性 5：未认证请求访问 /dashboard/* 始终被重定向

*对于任意*以 `/dashboard` 开头的请求路径（包括任意子路径和查询字符串），
在不存在有效 session cookie 的情况下，middleware 必须返回重定向至 `/login` 的响应。

**验证：需求 4.1、4.2**

---

### 属性 6：已认证请求访问 /dashboard/* 始终放行

*对于任意*以 `/dashboard` 开头的请求路径，在存在有效 session cookie 的情况下，
middleware 必须允许请求继续（不重定向）。

**验证：需求 4.3**

---

### 属性 7：已认证用户访问 /login 被重定向至 /dashboard

*对于任意*存在有效 session cookie 的 `/login` 请求，middleware 必须返回重定向至 `/dashboard` 的响应。

**验证：需求 4.4**

---

### 属性 8：Profile upsert 具有幂等性

*对于任意*已认证用户 ID，调用 `upsertProfile` 一次或多次，必须在 `public.profiles` 中
恰好产生一行记录，`id` 等于用户的 UUID，`default_language` 等于 `'zh-CN'`。

**验证：需求 5.1、5.2、5.5**

---

### 属性 9：Profile upsert 失败不阻塞导航

*对于任意* Supabase upsert 调用抛出异常或返回错误的场景，`upsertProfile` 必须捕获错误，
用 `requestId` 记录日志，并在不抛出异常的情况下返回，允许调用方继续重定向至 `/dashboard`。

**验证：需求 5.4**

---

### 属性 10：Session cookie 属性始终正确

*对于任意*通过 auth callback 建立的 session，写入 response 的 cookie 必须设置
`HttpOnly`、`Secure` 和 `SameSite=Lax` 属性。

**验证：需求 7.1**

---

## 错误处理

### 登录错误

| 场景 | 处理方式 |
|---|---|
| 无效邮箱（客户端） | 显示 Zod 校验错误内联提示；不调用 Supabase |
| Supabase `signInWithOtp` 错误 | 在 `LoginForm` 中显示错误信息；重新启用提交按钮 |
| 网络超时 | 视为 Supabase 错误；同上处理 |

### Auth Callback 错误

| 场景 | 处理方式 |
|---|---|
| `code` 参数缺失或无效 | 跳过 `exchangeCodeForSession`；重定向至 `/login?error=invalid_link` |
| `exchangeCodeForSession` 错误 | 用 `requestId` 记录错误；重定向至 `/login?error=auth_failed` |
| `upsertProfile` 错误 | 用 `requestId` 记录错误；继续重定向至 `/dashboard`（非阻塞） |

### 登出错误

| 场景 | 处理方式 |
|---|---|
| Supabase `signOut` 错误 | 用 `requestId` 记录错误；无论如何重定向至 `/login` |

### Middleware 错误

Middleware 不得抛出异常。任何读取 session 时的错误（如 cookie 格式错误）
均视为"无 session"，对受保护路由返回重定向至 `/login`。

### 错误日志

所有服务端错误使用 `src/lib/errors/index.ts` 中已有的 `generateRequestId()`，
并通过 `console.error` 记录（结构化日志集成为后续工作）。

---

## 测试策略

### 双重测试方法

单元测试和属性测试均为必要，两者互补：

- **单元测试**：验证具体示例、集成点和边界情况。
- **属性测试**：通过大量生成的输入验证普遍性属性。

### 单元测试（`tests/unit/auth/`）

重点覆盖：
- `LoginForm` 渲染邮箱输入框、label 和提交按钮（需求 1.1、6.3）
- `LoginForm` 在 OTP 发送成功后显示确认状态（需求 6.4）
- `LoginForm` 在 loading 期间禁用提交按钮（需求 1.7）
- Auth callback 路由在成功时重定向至 `/dashboard`（需求 1.5）
- Auth callback 路由在失败时重定向至 `/login?error=...`（错误处理）
- `upsertProfile` 使用 anon 客户端，而非 service role 客户端（需求 5.3）
- `createSupabaseBrowserClient` 不使用 `localStorage`（需求 7.4）
- `/login` 页面渲染产品名称和登录方式说明（需求 6.2）
- 登录页 HTML 中存在 `noscript` 降级提示（需求 6.6）

### 属性测试（`tests/unit/auth/properties/`）

使用 **Vitest** + **fast-check**。

每个属性测试最少运行 **100 次迭代**。

每个测试文件以如下格式注释标记：
`// Feature: user-authentication, Property N: <属性描述>`

| 测试文件 | 属性 | fast-check 任意值 |
|---|---|---|
| `p1-invalid-email-rejected.test.ts` | 属性 1 | `fc.string()` 过滤为非邮箱 |
| `p2-valid-email-triggers-signin.test.ts` | 属性 2 | `fc.emailAddress()` |
| `p3-signout-always-redirects.test.ts` | 属性 3 | `fc.boolean()`（登出成功/失败） |
| `p4-getsession-null-without-cookie.test.ts` | 属性 4 | `fc.record(...)` 请求变体 |
| `p5-unauthenticated-dashboard-redirect.test.ts` | 属性 5 | `fc.string()` 路径后缀 |
| `p6-authenticated-dashboard-proceeds.test.ts` | 属性 6 | `fc.string()` 路径后缀 |
| `p7-authenticated-login-redirect.test.ts` | 属性 7 | `fc.record(...)` session 变体 |
| `p8-upsert-idempotent.test.ts` | 属性 8 | `fc.uuid()` 用户 ID，`fc.integer({min:1,max:5})` 调用次数 |
| `p9-upsert-failure-nonblocking.test.ts` | 属性 9 | `fc.string()` 错误信息 |
| `p10-cookie-attributes.test.ts` | 属性 10 | `fc.record(...)` session 数据 |

### 集成测试

属性 8（profile upsert 幂等性）还应通过针对真实 Supabase 实例的集成测试覆盖
（遵循 `tests/integration/supabase-infrastructure/` 中已建立的模式），
端到端验证 RLS 策略的执行效果。
