'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: '控制台' },
  { href: '/dashboard/history', label: '生成记录' },
  { href: '/dashboard/scripts', label: '脚本库' },
  { href: '/dashboard/templates', label: '模板' },
  { href: '/dashboard/batch', label: '批量生成' },
  { href: '/dashboard/teams', label: '团队' },
  { href: '/dashboard/api-keys', label: 'API Keys' },
  { href: '/dashboard/extension', label: '插件' },
  { href: '/dashboard/subscription', label: '订阅' },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-4 overflow-x-auto whitespace-nowrap">
      <span className="shrink-0 text-sm font-semibold text-zinc-900">AutoContent Pro</span>
      {NAV_ITEMS.map((item) => {
        const active = item.href === '/dashboard'
          ? pathname === '/dashboard'
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 text-sm ${
              active
                ? 'font-medium text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
