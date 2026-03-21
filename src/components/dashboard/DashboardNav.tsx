'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: '生成内容', exact: true },
  { href: '/dashboard', label: '控制台', exact: true },
  { href: '/dashboard/history', label: '生成记录', exact: false },
  { href: '/dashboard/scripts', label: '脚本库', exact: false },
  { href: '/dashboard/templates', label: '模板', exact: false },
  { href: '/dashboard/batch', label: '批量生成', exact: false },
  { href: '/dashboard/teams', label: '团队', exact: false },
  { href: '/dashboard/api-keys', label: 'API Keys', exact: false },
  { href: '/dashboard/extension', label: '插件', exact: false },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-4 overflow-x-auto whitespace-nowrap">
      <Link href="/" className="shrink-0 text-sm font-semibold text-zinc-900">
        AutoContent Pro
      </Link>
      {NAV_ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
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
