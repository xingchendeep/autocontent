'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTeams } from '@/hooks/useTeams';
import { TeamDetail } from '@/components/dashboard/TeamDetail';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { teamNameSchema } from '@/lib/validations/team';
import type { TeamRole } from '@/types';

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
};

type View = { type: 'list' } | { type: 'detail'; teamId: string; role: TeamRole };

export function TeamPanel() {
  const { teams, loading, error, create } = useTeams();
  const [view, setView] = useState<View>({ type: 'list' });
  const [showForm, setShowForm] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [nameError, setNameError] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    const result = teamNameSchema.safeParse({ name: teamName });
    if (!result.success) {
      setNameError(result.error.issues[0]?.message ?? '名称无效');
      return;
    }
    setNameError('');
    setCreating(true);
    const ok = await create(teamName);
    setCreating(false);
    if (ok) {
      setTeamName('');
      setShowForm(false);
    }
  }

  if (view.type === 'detail') {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <button
          type="button"
          onClick={() => setView({ type: 'list' })}
          className="mb-4 text-sm text-blue-600 hover:underline"
        >
          ← 返回团队列表
        </button>
        <TeamDetail teamId={view.teamId} currentUserRole={view.role} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">团队管理</h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
        >
          创建团队
        </button>
      </div>

      {error === 'PLAN_LIMIT_REACHED' && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          当前套餐不支持团队功能。
          <Link href="/dashboard/subscription" className="ml-1 text-blue-600 hover:underline">升级套餐</Link>
        </div>
      )}

      {showForm && (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-900">创建新团队</h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="团队名称"
                maxLength={100}
                className={`w-full rounded-md border px-3 py-2 text-sm ${nameError ? 'border-red-500' : 'border-zinc-300'}`}
                disabled={creating}
              />
              {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {creating ? '创建中…' : '创建'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setTeamName(''); setNameError(''); }}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <Skeleton rows={2} widths={['100%', '80%']} />
      ) : teams.length === 0 ? (
        <EmptyState
          title="还没有加入团队"
          description="创建一个团队，邀请成员协作"
          action={{ label: '创建团队', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView({ type: 'detail', teamId: t.id, role: t.role })}
              className="rounded-lg border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:shadow-sm"
            >
              <h3 className="text-sm font-medium text-zinc-900">{t.name}</h3>
              <div className="mt-2 flex gap-3 text-xs text-zinc-500">
                <span>{ROLE_LABELS[t.role]}</span>
                <span>·</span>
                <span>{t.memberCount} 名成员</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
