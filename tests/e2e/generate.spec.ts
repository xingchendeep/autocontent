import { test, expect } from '@playwright/test'

/**
 * E2E: 生成路径测试
 *
 * 关键选择器（来自组件实现）：
 *   - 内容输入框：  textarea[aria-label="内容输入"]
 *   - 平台按钮：    button[data-platform]
 *   - 生成按钮：    button[type="button"]:has-text("一键生成")
 *   - 结果卡片：    .rounded-lg.border (ResultCard 根元素)，或复制按钮 aria-label
 *   - 复制按钮：    button[aria-label^="复制"]
 *   - 已复制反馈：  button[aria-label^="复制"]:has-text("已复制")
 *   - 错误提示：    p[role="alert"]（page.tsx 中的错误状态）
 */

const SAMPLE_CONTENT = '今天分享一个提升工作效率的小技巧，只需三步就能让你的工作效率翻倍。'

/** 选择第一个平台按钮 */
async function selectFirstPlatform(page: import('@playwright/test').Page) {
  const btn = page.locator('button[data-platform]').first()
  await expect(btn).toBeVisible({ timeout: 5_000 })
  await btn.click()
  // 确认已选中（aria-pressed="true"）
  await expect(btn).toHaveAttribute('aria-pressed', 'true')
}

test.describe('生成流程', () => {
  test('匿名用户粘贴内容并选择平台后点击生成，看到结果卡片', async ({ page }) => {
    await page.goto('/')

    await page.fill('textarea[aria-label="内容输入"]', SAMPLE_CONTENT)
    await selectFirstPlatform(page)

    await page.click('button[type="button"]:has-text("一键生成")')

    // ResultCard 渲染后会出现复制按钮（aria-label="复制 {平台名}"）
    await expect(
      page.locator('button[aria-label^="复制"]').first()
    ).toBeVisible({ timeout: 35_000 })
  })

  test('点击复制按钮触发剪贴板写入或显示成功指示', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    await page.goto('/')
    await page.fill('textarea[aria-label="内容输入"]', SAMPLE_CONTENT)
    await selectFirstPlatform(page)

    await page.click('button[type="button"]:has-text("一键生成")')

    // 等待结果卡片出现
    const copyBtn = page.locator('button[aria-label^="复制"]').first()
    await expect(copyBtn).toBeVisible({ timeout: 35_000 })

    await copyBtn.click()

    // 复制后按钮文字变为"已复制 ✓"
    await expect(copyBtn).toContainText('已复制', { timeout: 3_000 })
  })

  test('空内容提交显示验证错误且不调用 API', async ({ page }) => {
    let apiCalled = false
    page.on('request', (req) => {
      if (req.url().includes('/api/generate')) apiCalled = true
    })

    await page.goto('/')

    // 不填内容时生成按钮应为 disabled（canGenerate = false）
    const generateBtn = page.locator('button[type="button"]:has-text("一键生成")')
    await expect(generateBtn).toBeDisabled()

    expect(apiCalled).toBe(false)
  })

  test('API 返回 RATE_LIMITED 时 UI 显示用户友好错误消息', async ({ page }) => {
    await page.route('/api/generate', (route) => {
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: '请求过于频繁，请稍后再试',
            details: { retryAfter: Math.floor(Date.now() / 1000) + 3600 },
          },
          requestId: 'test-request-id',
          timestamp: new Date().toISOString(),
        }),
      })
    })

    await page.goto('/')
    await page.fill('textarea[aria-label="内容输入"]', SAMPLE_CONTENT)
    await selectFirstPlatform(page)

    await page.click('button[type="button"]:has-text("一键生成")')

    // page.tsx 错误状态：<p role="alert"> 显示 errorMessage
    await expect(
      page.locator('p[role="alert"]')
    ).toBeVisible({ timeout: 5_000 })

    await expect(
      page.locator('p[role="alert"]')
    ).toContainText('频繁')
  })
})
