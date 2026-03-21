import { getSession } from '@/lib/auth';
import Link from 'next/link';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { TeamContextSwitcher } from '@/components/dashboard/TeamContextSwitcher';
import { UserMenu } from '@/components/dashboard/UserMenu';
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
                <Link href="/pricing" className="text-sm text-zinc-500 hover:text-zinc-900">定价</Link>
                <TeamContextSwitcher />
                {session && <UserMenu email={session.email} />}
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </TeamContextProvider>
    </ToastProvider>
  );
}
