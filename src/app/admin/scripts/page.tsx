'use client';

import { ScriptManager } from '@/components/admin/ScriptManager';

export default function AdminScriptsPage() {
  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-zinc-900">脚本库管理</h1>
      <p className="mb-6 text-sm text-zinc-500">查看和管理所有用户保存的脚本</p>
      <ScriptManager />
    </div>
  );
}
