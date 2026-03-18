'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/admin', label: '概览', icon: '📊' },
  { href: '/admin/settings', label: '站点设置', icon: '⚙️' },
  { href: '/admin/users', label: '用户管理', icon: '👥' },
  { href: '/admin/generations', label: '生成记录', icon: '📝' },
  { href: '/admin/templates', label: '系统模板', icon: '📋' },
  { href: '/admin/keywords', label: '关键词', icon: '🔑' },
  { href: '/admin/audit-logs', label: '审计日志', icon: '📜' },
  { href: '/admin/plans', label: '套餐管理', icon: '💰' },
  { href: '/admin/scripts', label: '脚本库', icon: '📄' },
  { href: '/admin/system-config', label: '系统配置', icon: '🔧' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1" aria-label="管理后台导航">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
