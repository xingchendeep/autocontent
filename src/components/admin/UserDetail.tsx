'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/contexts/ToastContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface UserDetailData {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  planCode: string | null;
  generationCount: number;
  isDisabled: boolean;
  createdAt: string;
  subscription: {
    planCode: string;
    planName: string;
    status: string;
    currentPeriodEnd: string | null;
  } | null;
  usageStats: {
    currentMonth: string;
    monthlyCount: number;
    totalCount: number;
  } | null;
  recentGenerations: Array<{
    id: string;
    platforms: string[];
    status: string;
    createdAt: string;
  }>;
}

export function UserDetail({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [user, setUser] = useState<UserDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'disable' | 'enable' | 'role' | 'subscription';
    value?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      const json = await res.json();
      if (json.success) setUser(json.data);
      else toast({ type: 'error', message: json.error?.message ?? '加载失败' });
    } catch {
      toast({ type: 'error', message: '加载用户详情失败' });
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const handleToggleStatus = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDisabled: !user.isDisabled }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ type: 'success', message: user.isDisabled ? '已启用' : '已禁用' });
        fetchUser();
      } else {
        toast({ type: 'error', message: json.error?.message ?? '操作失败' });
      }
    } catch {
      toast({ type: 'error', message: '操作失败' });
    } finally {
      setSaving(false);
      setConfirmAction(null);
    }
  }, [user, userId, toast, fetchUser]);

  const handleRoleChange = useCallback(
    async (newRole: string) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole }),
        });
        const json = await res.json();
        if (json.success) {
          toast({ type: 'success', message: '角色已更新' });
          fetchUser();
        } else {
          toast({ type: 'error', message: json.error?.message ?? '操作失败' });
        }
      } catch {
        toast({ type: 'error', message: '操作失败' });
      } finally {
        setSaving(false);
        setConfirmAction(null);
      }
    },
    [userId, toast, fetchUser],
  );

  const handleSubscriptionChange = useCallback(
    async (planCode: string) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/admin/users/${userId}/subscription`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planCode }),
        });
        const json = await res.json();
        if (json.success) {
          toast({ type: 'success', message: '订阅已更新' });
          fetchUser();
        } else {
          toast({ type: 'error', message: json.error?.message ?? '操作失败' });
        }
      } catch {
        toast({ type: 'error', message: '操作失败' });
      } finally {
        setSaving(false);
        setConfirmAction(null);
      }
    },
    [userId, toast, fetchUser],
  );

  const handleConfirm = useCallback(() => {
    if (!confirmAction) return;
    if (confirmAction.type === 'disable' || confirmAction.type === 'enable') {
      handleToggleStatus();
    } else if (confirmAction.type === 'role' && confirmAction.value) {
      handleRoleChange(confirmAction.value);
    } else if (confirmAction.type === 'subscription' && confirmAction.value) {
      handleSubscriptionChange(confirmAction.value);
    }
  }, [confirmAction, handleToggleStatus, handleRoleChange, handleSubscriptionChange]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-zinc-400">加载中…</p>;
  }

  if (!user) {
    return <p className="py-8 text-center text-sm text-zinc-400">用户不存在</p>;
  }

  return (
    <div>
      <Link
        href="/admin/users"
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        ← 返回用户列表
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {/* Basic info */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">基本信息</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <InfoRow label="邮箱" value={user.email} />
            <InfoRow label="昵称" value={user.displayName ?? '—'} />
            <InfoRow label="角色" value={user.role} />
            <InfoRow label="状态" value={user.isDisabled ? '已禁用' : '正常'} />
            <InfoRow
              label="注册时间"
              value={new Date(user.createdAt).toLocaleString('zh-CN')}
            />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                setConfirmAction({
                  type: user.isDisabled ? 'enable' : 'disable',
                })
              }
              className={`rounded-md px-3 py-1.5 text-sm text-white ${
                user.isDisabled
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              } disabled:opacity-50`}
            >
              {user.isDisabled ? '启用账户' : '禁用账户'}
            </button>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  setConfirmAction({ type: 'role', value: e.target.value });
                }
              }}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
              aria-label="修改角色"
            >
              <option value="">修改角色…</option>
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
              <option value="super_admin">超级管理员</option>
            </select>
          </div>
        </div>

        {/* Subscription */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">订阅信息</h2>
          {user.subscription ? (
            <dl className="mt-3 space-y-2 text-sm">
              <InfoRow label="计划" value={user.subscription.planName} />
              <InfoRow label="状态" value={user.subscription.status} />
              <InfoRow
                label="到期时间"
                value={
                  user.subscription.currentPeriodEnd
                    ? new Date(user.subscription.currentPeriodEnd).toLocaleDateString('zh-CN')
                    : '—'
                }
              />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">无订阅</p>
          )}
          <div className="mt-4">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  setConfirmAction({
                    type: 'subscription',
                    value: e.target.value,
                  });
                }
              }}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
              aria-label="修改订阅"
            >
              <option value="">修改订阅…</option>
              <option value="free">Free</option>
              <option value="creator">Creator</option>
              <option value="studio">Studio</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
        </div>

        {/* Usage stats */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">使用统计</h2>
          {user.usageStats ? (
            <dl className="mt-3 space-y-2 text-sm">
              <InfoRow label="当月" value={user.usageStats.currentMonth} />
              <InfoRow
                label="本月生成"
                value={String(user.usageStats.monthlyCount)}
              />
              <InfoRow
                label="总生成"
                value={String(user.usageStats.totalCount)}
              />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">暂无统计</p>
          )}
        </div>

        {/* Recent generations */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">最近生成记录</h2>
          {user.recentGenerations.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">暂无记录</p>
          ) : (
            <div className="mt-3 space-y-2">
              {user.recentGenerations.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div>
                    <span className="text-zinc-600">
                      {g.platforms.join(', ')}
                    </span>
                    <span
                      className={`ml-2 text-xs ${
                        g.status === 'success'
                          ? 'text-green-600'
                          : g.status === 'failed'
                            ? 'text-red-600'
                            : 'text-yellow-600'
                      }`}
                    >
                      {g.status}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-400">
                    {new Date(g.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title="确认操作"
        message={getConfirmMessage(confirmAction, user)}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
        destructive={confirmAction?.type === 'disable'}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-700">{value}</dd>
    </div>
  );
}

function getConfirmMessage(
  action: { type: string; value?: string } | null,
  user: { email: string; isDisabled: boolean },
): string {
  if (!action) return '';
  switch (action.type) {
    case 'disable':
      return `确定要禁用用户 ${user.email} 吗？`;
    case 'enable':
      return `确定要启用用户 ${user.email} 吗？`;
    case 'role':
      return `确定要将 ${user.email} 的角色修改为 ${action.value} 吗？`;
    case 'subscription':
      return `确定要将 ${user.email} 的订阅修改为 ${action.value} 吗？`;
    default:
      return '';
  }
}
