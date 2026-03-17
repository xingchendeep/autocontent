'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { TeamRole } from '@/types';

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
};

interface InvitationAcceptProps {
  token: string;
  teamId: string;
  teamName: string;
  role: string;
  expired: boolean;
  isLoggedIn: boolean;
}

export function InvitationAccept({ token, teamId, teamName, role, expired, isLoggedIn }: InvitationAcceptProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function handleAccept() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/invitations/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = await res.json();
      if (body.success) {
        setAccepted(true);
        setTimeout(() => router.push('/dashboard/teams'), 1500);
      } else {
        setError(body.error?.message ?? '接受邀请失败');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  const roleLabel = ROLE_LABELS[role as TeamRole] ?? role;

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="mb-2 text-xl font-semibold text-zinc-900">团队邀请</h1>

      {expired ? (
        <div className="mt-6">
          <p className="text-sm text-zinc-500">邀请已失效</p>
          <p className="mt-2 text-xs text-zinc-400">请联系团队管理员重新发送邀请</p>
        </div>
      ) : !isLoggedIn ? (
        <div className="mt-6">
          <p className="text-sm text-zinc-500">请先登录后再接受邀请</p>
          <Link
            href={`/login?redirect=/teams/accept?token=${encodeURIComponent(token)}`}
            className="mt-4 inline-block rounded-md bg-zinc-900 px-6 py-2 text-sm text-white hover:bg-zinc-800"
          >
            前往登录
          </Link>
        </div>
      ) : accepted ? (
        <div className="mt-6">
          <p className="text-sm text-green-600">已成功加入团队，正在跳转…</p>
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-sm text-zinc-600">
            您被邀请加入团队「<span className="font-medium text-zinc-900">{teamName}</span>」，
            角色为「<span className="font-medium text-zinc-900">{roleLabel}</span>」
          </p>
          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
          <button
            type="button"
            onClick={handleAccept}
            disabled={loading}
            className="mt-6 rounded-md bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? '接受中…' : '接受邀请'}
          </button>
        </div>
      )}
    </div>
  );
}
