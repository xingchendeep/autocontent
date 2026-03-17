'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/auth/client';

export default function Navbar() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user?.email ? { email: data.user.email } : null);
      setLoading(false);
    });
  }, []);

  return (
    <nav className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-[800px] items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold text-zinc-900">
          AutoContent Pro
        </Link>

        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-zinc-600 hover:text-zinc-900">
            定价
          </Link>

          {loading ? (
            <span className="h-5 w-16 animate-pulse rounded bg-zinc-100" />
          ) : user ? (
            <>
              <Link href="/dashboard" className="text-zinc-600 hover:text-zinc-900">
                控制台
              </Link>
              <Link href="/dashboard/history" className="text-zinc-600 hover:text-zinc-900">
                生成记录
              </Link>
              <form action="/api/signout" method="POST" className="inline">
                <button type="submit" className="text-zinc-500 hover:text-zinc-900">
                  退出
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-white hover:bg-zinc-700"
            >
              登录
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
