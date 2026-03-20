'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/auth/client';
import { resetPasswordFormSchema } from '@/lib/validations/auth';
import { useToast } from '@/contexts/ToastContext';

interface ProfileData {
  email: string;
  displayName: string | null;
  createdAt: string | null;
  subscription: {
    planCode: string;
    planName: string;
    status: string;
    currentPeriodEnd: string | null;
  } | null;
}

const STATUS_LABELS: Record<string, string> = {
  active: '生效中',
  trialing: '试用中',
  past_due: '逾期',
  paused: '已暂停',
  cancelled: '已取消',
  expired: '已过期',
};

export function ProfileForm() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Password change
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [pwSaving, setPwSaving] = useState(false);

  const { toast } = useToast();

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/profile');
      const json = await res.json();
      if (json.success) {
        setProfile(json.data);
        setDisplayName(json.data.displayName ?? '');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  async function handleSaveName() {
    setSavingName(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() || null }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ type: 'success', message: '昵称已更新' });
        fetchProfile();
      } else {
        toast({ type: 'error', message: json.error?.message ?? '更新失败' });
      }
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErrors({});

    const result = resetPasswordFormSchema.safeParse({ password, confirmPassword });
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0]?.toString();
        if (key && !errors[key]) errors[key] = issue.message;
      }
      setPwErrors(errors);
      return;
    }

    setPwSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: result.data.password });
      if (error) {
        toast({ type: 'error', message: '密码修改失败，请稍后重试' });
        return;
      }
      toast({ type: 'success', message: '密码已修改' });
      setPassword('');
      setConfirmPassword('');
    } catch {
      toast({ type: 'error', message: '网络异常，请稍后重试' });
    } finally {
      setPwSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">加载中...</p>;
  if (!profile) return <p className="text-sm text-red-500">无法加载个人信息</p>;

  return (
    <div className="space-y-8">
      {/* Section 1: Basic Info */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-zinc-900">基本信息</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">邮箱</label>
            <p className="text-sm text-zinc-900">{profile.email}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">注册时间</label>
            <p className="text-sm text-zinc-900">
              {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('zh-CN') : '—'}
            </p>
          </div>
          <div>
            <label htmlFor="profile-display-name" className="mb-1 block text-xs text-zinc-500">显示名称</label>
            <div className="flex gap-2">
              <input
                id="profile-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="设置你的昵称"
                maxLength={100}
                className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
              />
              <button
                onClick={handleSaveName}
                disabled={savingName}
                className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {savingName ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Change Password */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-zinc-900">修改密码</h2>
        <form onSubmit={handleChangePassword} className="max-w-sm space-y-3">
          <div>
            <label htmlFor="profile-new-pw" className="mb-1 block text-xs text-zinc-500">新密码</label>
            <input
              id="profile-new-pw"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 个字符，包含字母和数字"
              className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
            />
            {pwErrors.password && <p className="mt-0.5 text-xs text-red-600">{pwErrors.password}</p>}
          </div>
          <div>
            <label htmlFor="profile-confirm-pw" className="mb-1 block text-xs text-zinc-500">确认新密码</label>
            <input
              id="profile-confirm-pw"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
              className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
            />
            {pwErrors.confirmPassword && <p className="mt-0.5 text-xs text-red-600">{pwErrors.confirmPassword}</p>}
          </div>
          <button
            type="submit"
            disabled={pwSaving}
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {pwSaving ? '修改中...' : '修改密码'}
          </button>
        </form>
      </section>

      {/* Section 3: Subscription */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-zinc-900">订阅信息</h2>
        {profile.subscription ? (
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-zinc-500">当前套餐：</span>
              <span className="font-medium text-zinc-900">{profile.subscription.planName}</span>
            </p>
            <p>
              <span className="text-zinc-500">状态：</span>
              <span className="font-medium text-zinc-900">
                {STATUS_LABELS[profile.subscription.status] ?? profile.subscription.status}
              </span>
            </p>
            {profile.subscription.currentPeriodEnd && (
              <p>
                <span className="text-zinc-500">到期时间：</span>
                <span className="text-zinc-900">
                  {new Date(profile.subscription.currentPeriodEnd).toLocaleDateString('zh-CN')}
                </span>
              </p>
            )}
            <Link href="/pricing" className="mt-2 inline-block text-sm text-zinc-600 underline hover:text-zinc-900">
              查看套餐详情
            </Link>
          </div>
        ) : (
          <div className="text-sm text-zinc-500">
            <p>当前使用免费版</p>
            <Link href="/pricing" className="mt-2 inline-block text-zinc-600 underline hover:text-zinc-900">
              升级套餐
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
