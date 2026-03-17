import Link from 'next/link';
import { getSession } from '@/lib/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <nav className="flex items-center gap-4">
            <span className="text-sm font-semibold text-zinc-900">AutoContent Pro</span>
            <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900">控制台</Link>
            <Link href="/dashboard/history" className="text-sm text-zinc-500 hover:text-zinc-900">生成记录</Link>
            <Link href="/dashboard/scripts" className="text-sm text-zinc-500 hover:text-zinc-900">脚本库</Link>
            <Link href="/dashboard/api-keys" className="text-sm text-zinc-500 hover:text-zinc-900">API Keys</Link>
            <Link href="/dashboard/subscription" className="text-sm text-zinc-500 hover:text-zinc-900">订阅</Link>
          </nav>
          {session && (
            <form action="/api/signout" method="POST">
              <button
                type="submit"
                className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline"
              >
                退出登录
              </button>
            </form>
          )}
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
