export const metadata = {
  title: '隐私政策 - AutoContent Pro',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold text-zinc-900">隐私政策</h1>
      <p className="mb-6 text-sm text-zinc-500">最后更新日期：2026 年 3 月 18 日</p>

      <div className="space-y-8 text-sm leading-relaxed text-zinc-700">
        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">1. 概述</h2>
          <p>
            AutoContent Pro（以下简称「我们」）重视您的隐私。本隐私政策说明我们在您使用
            AutoContent Pro 网站及浏览器扩展（以下统称「服务」）时，如何收集、使用和保护您的信息。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">2. 我们收集的信息</h2>
          <h3 className="mb-2 font-medium text-zinc-800">2.1 账户信息</h3>
          <p className="mb-3">
            当您注册账户时，我们会收集您的电子邮箱地址和密码（加密存储）。
          </p>
          <h3 className="mb-2 font-medium text-zinc-800">2.2 使用数据</h3>
          <p className="mb-3">
            我们记录您的生成次数、使用的目标平台等汇总统计数据，用于提供用量展示和套餐限制功能。
          </p>
          <h3 className="mb-2 font-medium text-zinc-800">2.3 输入内容</h3>
          <p className="mb-3">
            您提交的视频脚本、URL 或文本内容会被发送至 AI 服务进行处理。我们不会将您的输入内容用于训练模型或分享给第三方。
          </p>
          <h3 className="mb-2 font-medium text-zinc-800">2.4 浏览器扩展</h3>
          <p>
            浏览器扩展仅在您主动点击时提取当前页面的正文内容（如微信公众号文章、知乎文章），
            并通过您配置的 API Key 发送至 AutoContent Pro 服务器进行文案生成。
            扩展不会在后台自动收集任何浏览数据。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">3. 信息的使用</h2>
          <p>我们使用收集的信息用于：</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>提供、维护和改进服务</li>
            <li>处理您的文案生成请求</li>
            <li>管理您的账户和订阅</li>
            <li>发送与服务相关的通知（如密码重置）</li>
            <li>防止滥用和保障服务安全</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">4. 信息的共享</h2>
          <p>我们不会出售您的个人信息。仅在以下情况下共享数据：</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>AI 服务提供商：您的输入内容会发送至 AI 接口进行处理</li>
            <li>支付处理：订阅付款通过 Creem.io 处理</li>
            <li>法律要求：在法律法规要求的情况下</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">5. 数据存储与安全</h2>
          <p>
            您的数据存储在 Supabase 托管的 PostgreSQL 数据库中，采用行级安全策略（RLS）保护。
            密码使用 bcrypt 加密存储。所有数据传输均通过 HTTPS 加密。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">6. 您的权利</h2>
          <p>您有权：</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>访问和导出您的数据</li>
            <li>更正您的账户信息</li>
            <li>删除您的账户及相关数据</li>
            <li>取消订阅服务通知</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">7. Cookie</h2>
          <p>
            我们使用必要的 Cookie 来维持您的登录会话。我们可能使用分析工具（如 Vercel Analytics）
            收集匿名的访问统计数据。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">8. 政策更新</h2>
          <p>
            我们可能会不时更新本隐私政策。更新后的政策将在本页面发布，并更新「最后更新日期」。
            继续使用服务即表示您同意更新后的政策。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">9. 联系我们</h2>
          <p>
            如果您对本隐私政策有任何疑问，请通过电子邮件联系我们：
            <a href="mailto:[email]" className="text-blue-600 hover:underline">[email]</a>
          </p>
        </section>
      </div>
    </div>
  );
}
