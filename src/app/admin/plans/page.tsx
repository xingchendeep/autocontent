'use client';

import { PlanManager } from '@/components/admin/PlanManager';

export default function AdminPlansPage() {
  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-zinc-900">套餐管理</h1>
      <p className="mb-6 text-sm text-zinc-500">管理订阅套餐的价格、功能和状态</p>
      <PlanManager />
    </div>
  );
}
