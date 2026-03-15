import { test, expect } from '@playwright/test'

/**
 * E2E: 登录路径测试
 *
 * LoginForm 使用 magic link（OTP）流程：
 *   - 有效邮箱 → 显示"登录链接已发送"成功提示，不跳转
 *   - 无效邮箱格式 → 显示验证错误，不调用 Supabase API
 *   - 已认证用户（storageState）→ dashboard 正常渲染
 */

test.describe('登录页面', () => {
  test('有效邮箱提交后显示魔法链接已发送提示', async ({ page }) => {
    await page.goto('/login')

    await page.fill('input[type="email"]', 'test@example.com')
    await page.click('button[type="submit"]')

    // LoginForm 切换到 sent 状态，显示成功提示
    await expect(
      page.locator('text=登录链接已发送至')
    ).toBeVisible({ timeout: 10_000 })

    // 不应跳转到 dashboard
    expect(page.url()).toContain('/login')
  })

  test('无效邮箱格式显示验证错误且不调用 API', async ({ page }) => {
    // 拦截 Supabase auth 请求，确保不被调用
    let apiCalled = false
    page.on('request', (req) => {
      if (req.url().includes('/auth/v1/otp')) apiCalled = true
    })

    await page.goto('/login')

    await page.fill('input[type="email"]', 'not-an-email')
    await page.click('button[type="submit"]')

    // 显示验证错误（#email-error 元素带 role="alert"）
    await expect(page.locator('#email-error')).toBeVisible()
    await expect(page.locator('#email-error')).toContainText('邮箱')

    expect(apiCalled).toBe(false)
  })
})

test.describe('已认证用户', () => {
  // 这组测试使用 storageState（由 auth.setup.ts 生成）
  test('dashboard 页面正常渲染', async ({ page }) => {
    await page.goto('/dashboard')

    // 不应被重定向到 /login
    await expect(page).not.toHaveURL(/\/login/)

    // dashboard 页面应有内容
    await expect(page.locator('body')).toBeVisible()
  })
})
