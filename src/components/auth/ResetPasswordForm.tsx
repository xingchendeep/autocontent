'use client';

import { useState } from 'react';
import Link from 'next/link';
import { resetPasswordFormSchema } from '@/lib/validations/auth';
import { createSupabaseBrowserClient } from '@/lib/auth/client';

type UIState = 'idle' | 'loading' | 'success' | 'error';

export default function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [uiState, setUiState] = useState<UIState>('idle');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function mapSupabaseError(error: { message?: string }): string {
    const msg = error.message?.toLowerCase() ?? '';
    if (msg.includes('fetch') || msg.includes('network')) {
      return '网络异常，请稍后重试';
    }
    return '操作失败，请稍后重试';
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const result = resetPasswordFormSchema.safeParse({ password, confirmPassword });
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0]?.toString();
        if (key && !errors[key]) {
          errors[key] = issue.message;
        }
      }
      setFieldErrors(errors);
      setServerError(null);
      return;
    }

    setFieldErrors({});
    setServerError(null);
    setUiState('loading');

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({
        password: result.data.password,
      });

      if (error) {
        setUiState('error');
        setServerError(mapSupabaseError(error));
        return;
      }

      setUiState('success');
    } catch {
      setUiState('error');
      setServerError('网络异常，请稍后重试');
    }
  }

  if (uiState === 'success') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
        <p>密码已成功重置。</p>
        <Link href="/login" className="mt-2 inline-block text-green-800 underline hover:text-green-600">
          前往登录
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="reset-password" className="text-sm font-medium text-zinc-700">
          新密码
        </label>
        <input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) {
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next.password;
                return next;
              });
            }
          }}
          placeholder="至少 8 个字符，包含字母和数字"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          aria-describedby={fieldErrors.password ? 'reset-password-error' : undefined}
          aria-invalid={fieldErrors.password ? 'true' : undefined}
        />
        {fieldErrors.password && (
          <p id="reset-password-error" className="text-xs text-red-600" role="alert">
            {fieldErrors.password}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reset-confirm-password" className="text-sm font-medium text-zinc-700">
          确认新密码
        </label>
        <input
          id="reset-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            if (fieldErrors.confirmPassword) {
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next.confirmPassword;
                return next;
              });
            }
          }}
          placeholder="再次输入新密码"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          aria-describedby={fieldErrors.confirmPassword ? 'reset-confirm-password-error' : undefined}
          aria-invalid={fieldErrors.confirmPassword ? 'true' : undefined}
        />
        {fieldErrors.confirmPassword && (
          <p id="reset-confirm-password-error" className="text-xs text-red-600" role="alert">
            {fieldErrors.confirmPassword}
          </p>
        )}
      </div>

      {uiState === 'error' && serverError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={uiState === 'loading'}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uiState === 'loading' ? '处理中…' : '重置密码'}
      </button>
    </form>
  );
}
