'use client';

import { useState } from 'react';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { InviteForm } from '@/components/dashboard/InviteForm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import type { TeamRole } from '@/types';

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
};

interface TeamDetailProps {
  teamId: string;
  currentUserRole: TeamRole;
}

export function TeamDetail({ teamId, currentUserRole }: TeamDetailProps) {
  const { members, loading, removeMember, refresh } = useTeamMembers(teamId);
  const [showInvite, setShowInvite] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ userId: string; email: string } | null>(null);

  const canInvite = currentUserRole === 'owner' || currentUserRole === 'admin';
  const canRemove = currentUserRole === 'owner';

  async function handleRemove() {
    if (!removeTarget) return;
    await removeMember(removeTarget.userId);
    setRemoveTarget(null);
  }

  if (loading) {
    return <Skeleton rows={4} widths={['100%', '90%', '80%', '70%']} />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">团队成员</h2>
        {canInvite && (
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
          >
            邀请成员
          </button>
        )}
      </div>

      {showInvite && (
        <div className="mb-6">
          <InviteForm
            teamId={teamId}
            onSuccess={() => { setShowInvite(false); refresh(); }}
            onCancel={() => setShowInvite(false)}
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs text-zinc-500">
              <th className="pb-2 font-medium">邮箱</th>
              <th className="pb-2 font-medium">角色</th>
              <th className="pb-2 font-medium">加入时间</th>
              {canRemove && <th className="pb-2 font-medium">操作</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="border-b border-zinc-100">
                <td className="py-3 text-zinc-700">{m.email}</td>
                <td className="py-3">
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                    {ROLE_LABELS[m.role]}
                  </span>
                </td>
                <td className="py-3 text-zinc-500">
                  {new Date(m.joinedAt).toLocaleDateString('zh-CN')}
                </td>
                {canRemove && (
                  <td className="py-3">
                    {m.role !== 'owner' && (
                      <button
                        type="button"
                        onClick={() => setRemoveTarget({ userId: m.userId, email: m.email })}
                        className="text-xs text-red-600 hover:underline"
                      >
                        移除
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        title="移除成员"
        message={`确定要将「${removeTarget?.email}」从团队中移除吗？`}
        confirmLabel="移除"
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
        destructive
      />
    </div>
  );
}
