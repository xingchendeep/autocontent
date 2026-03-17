import Link from 'next/link';

export default function ExtensionPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">浏览器插件</h1>

      <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">功能介绍</h2>
        <ul className="space-y-2 text-sm text-zinc-600">
          <li>• 支持从微信公众号文章和知乎文章页面直接抓取正文内容</li>
          <li>• 在弹出面板中选择目标平台，一键生成多平台文案</li>
          <li>• 生成结果可直接复制使用</li>
          <li>• 使用 Open API 认证，需要先创建 API Key</li>
        </ul>
      </section>

      <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">安装指引</h2>
        <ol className="space-y-2 text-sm text-zinc-600 list-decimal list-inside">
          <li>下载插件压缩包并解压到本地目录</li>
          <li>打开 Chrome 浏览器，进入 <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">chrome://extensions</code></li>
          <li>开启右上角「开发者模式」</li>
          <li>点击「加载已解压的扩展程序」，选择解压后的目录</li>
          <li>插件图标出现在浏览器工具栏即安装成功</li>
        </ol>
      </section>

      <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">使用流程</h2>
        <ol className="space-y-2 text-sm text-zinc-600 list-decimal list-inside">
          <li>在插件设置中填入 API Key（在 API Keys 管理页面创建）</li>
          <li>打开微信公众号或知乎文章页面</li>
          <li>点击插件图标，正文内容会自动提取</li>
          <li>选择目标平台，点击「生成」</li>
          <li>复制生成的文案到对应平台发布</li>
        </ol>
      </section>

      <Link
        href="/dashboard/api-keys"
        className="inline-block rounded-md bg-zinc-900 px-6 py-2 text-sm text-white hover:bg-zinc-800"
      >
        前往 API Keys 管理
      </Link>
    </div>
  );
}
