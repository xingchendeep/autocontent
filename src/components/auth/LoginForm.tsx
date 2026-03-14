'use client';

import { useState } from 'react';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/auth/client';

const emailSchema = z.string().email('请输入有效的邮箱地址');

type UIState = 'idle' | 'loading' | 'sent' | 'error';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [uiState, setUiState] = useState<UIState>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Client-side Zod validation — never calls Supabase on invalid input
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? '邮箱格式无效');
      return;
    }
    setValidationError(null);

    setUiState('loading');
    setErrorMessage(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: result.data,
      options: { emailRedirectTo: '/auth/callback' },
    });

    if (error) {
      setUiState('error');
      setErrorMessage(error.message || '发送失败，请稍后重试');
      return;
    }

    setUiState('sent');
  }

  if (uiState === 'sent') {
    return (
      <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
        登录链接已发送至 <strong>{email}</strong>，请查收邮件并点击链接完成登录。
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-zinc-700">
          邮箱地址
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (validationError) setValidationError(null);
          }}
          placeholder="you@example.com"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          aria-describedby={validationError ? 'email-error' : undefined}
          aria-invalid={validationError ? 'true' : undefined}
        />
        {validationError && (
          <p id="email-error" className="text-xs text-red-600" role="alert">
            {validationError}
          </p>
        )}
      </div>

      {uiState === 'error' && errorMessage && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={uiState === 'loading'}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uiState === 'loading' ? '发送中…' : '发送登录链接'}
      </button>
    </form>
  );
}
