'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Footer() {
  const pathname = usePathname();

  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) return null;

  return (
    <footer className="border-t border-zinc-200 bg-white py-6 mt-12">
      <div className="mx-auto flex max-w-[800px] items-center justify-between px-4 text-xs text-zinc-400">
        <span>© {new Date().getFullYear()} AutoContent Pro</span>
        <div className="flex gap-4">
          <Link href="/terms" className="hover:text-zinc-600">服务条款</Link>
          <Link href="/privacy" className="hover:text-zinc-600">隐私政策</Link>
        </div>
      </div>
    </footer>
  );
}
