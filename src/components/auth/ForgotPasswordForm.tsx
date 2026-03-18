'use client';

import { useState } from 'react';
import { forgotPasswordFormSchema } from '@/lib/validations/auth';
import { createSupabaseBrowserClient } from '@/lib/auth/client';

type UIState = 'idle' | 'loading' | 'success' | 'error';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [uiState, setUiState] = useState<UIState>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidationError(null);
    setServerError(null);

    const result = forgotPasswordFormSchema.safeParse({ email });
    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? '请输入有效的邮箱地址');
      return;
    }

    setUiState('loading');

    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(result.data.email, {
        redirectTo,
      });

      // Security: always show success unless it's a network error.
      // This prevents email enumeration attacks.
      if (error) {
        const msg = error.message?.toLowerCase() ?? '';
        if (msg.includes('fetch') || msg.includes('network')) {
          setUiState('error');
          setServerError('网络异常，请稍后重试');
          return;
        }
      }

      setUiState('success');
    } catch {
      setUiState('error');
      setServerError('网络异常，请稍后重试');
    }
  }

  if (uiState === 'success') {
    return (
      <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
        如果该邮箱已注册，您将收到一封密码重置邮件。请查收邮箱并按照指引重置密码。
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="forgot-email" className="text-sm font-medium text-zinc-700">
          邮箱地址
        </label>
        <input
          id="forgot-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (validationError) setValidationError(null);
          }}
          placeholder="you@example.com"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          aria-describedby={validationError ? 'forgot-email-error' : undefined}
          aria-invalid={validationError ? 'true' : undefined}
        />
        {validationError && (
          <p id="forgot-email-error" className="text-xs text-red-600" role="alert">
            {validationError}
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
        {uiState === 'loading' ? '处理中…' : '发送重置链接'}
      </button>
    </form>
  );
}
