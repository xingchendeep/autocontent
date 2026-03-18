'use client';

import Link from 'next/link';
import { AdminNav } from './AdminNav';
import { ToastContainer } from '@/components/ui/Toast';

export function AdminLayout({
  children,
  email,
  role,
}: {
  children: React.ReactNode;
  email: string;
  role: string;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-4">
          <Link href="/admin" className="text-sm font-semibold text-zinc-900">
            管理后台
          </Link>
          <p className="mt-1 truncate text-xs text-zinc-500">{email}</p>
          <span className="mt-1 inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
            {role === 'super_admin' ? '超级管理员' : '管理员'}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <AdminNav />
        </div>
        <div className="border-t border-zinc-200 px-4 py-3">
          <Link
            href="/dashboard"
            className="text-xs text-zinc-500 hover:text-zinc-900"
          >
            ← 返回控制台
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-zinc-50 p-6">
        {children}
      </main>

      <ToastContainer />
    </div>
  );
}
