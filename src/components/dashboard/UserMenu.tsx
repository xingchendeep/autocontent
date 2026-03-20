'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface Props {
  email: string;
}

export function UserMenu({ email }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Show first char of email as avatar
  const initial = email.charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
        aria-label="用户菜单"
        aria-expanded={open}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white">
          {initial}
        </span>
        <span className="hidden max-w-[120px] truncate sm:inline">{email}</span>
        <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          <Link
            href="/dashboard/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            个人中心
          </Link>
          <form action="/api/signout" method="POST">
            <button
              type="submit"
              className="w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
            >
              退出登录
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
