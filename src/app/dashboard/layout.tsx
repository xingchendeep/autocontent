import { getSession } from '@/lib/auth';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { TeamContextSwitcher } from '@/components/dashboard/TeamContextSwitcher';
import { TeamContextProvider } from '@/contexts/TeamContext';
import { ToastProvider } from '@/contexts/ToastContext';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <ToastProvider>
      <TeamContextProvider>
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-zinc-200 bg-white px-6 py-3">
            <div className="mx-auto flex max-w-5xl items-center justify-between">
              <DashboardNav />
              <div className="flex shrink-0 items-center gap-4">
                <TeamContextSwitcher />
                {session && (
                  <form action="/api/signout" method="POST">
                    <button
                      type="submit"
                      className="shrink-0 text-sm text-zinc-500 hover:text-zinc-900 hover:underline"
                    >
                      退出登录
                    </button>
                  </form>
                )}
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </TeamContextProvider>
    </ToastProvider>
  );
}
