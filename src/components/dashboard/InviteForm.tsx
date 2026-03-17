'use client';

import { useState } from 'react';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { inviteFormSchema } from '@/lib/validations/team';

interface InviteFormProps {
  teamId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function InviteForm({ teamId, onSuccess, onCancel }: InviteFormProps) {
  const { invite } = useTeamMembers(teamId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = inviteFormSchema.safeParse({ email, role });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0]?.toString();
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    const ok = await invite(email, role);
    setLoading(false);
    if (ok) onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-zinc-900">邀请成员</h3>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="输入邮箱地址"
            className={`w-full rounded-md border px-3 py-2 text-sm ${errors.email ? 'border-red-500' : 'border-zinc-300'}`}
            disabled={loading}
          />
          {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          disabled={loading}
        >
          <option value="member">成员</option>
          <option value="admin">管理员</option>
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? '发送中…' : '发送邀请'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            取消
          </button>
        </div>
      </div>
    </form>
  );
}
