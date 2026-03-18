'use client';

import { useState } from 'react';
import { registerFormSchema } from '@/lib/validations/auth';
import { createSupabaseBrowserClient } from '@/lib/auth/client';

type UIState = 'idle' | 'loading' | 'success' | 'error';

export default function RegistrationForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [uiState, setUiState] = useState<UIState>('idle');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function mapSupabaseError(error: { message?: string }): string {
    const msg = error.message ?? '';
    if (msg.toLowerCase().includes('user already registered')) {
      return '该邮箱已被注册，请直接登录';
    }
    if (msg.toLowerCase().includes('invalid login credentials')) {
      return '邮箱或密码错误，请重试';
    }
    if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) {
      return '网络异常，请稍后重试';
    }
    return '操作失败，请稍后重试';
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Zod validation
    const result = registerFormSchema.safeParse({ email, password, confirmPassword });
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
      const { error } = await supabase.auth.signUp({
        email: result.data.email,
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
      <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
        注册成功！请查收邮箱完成验证。
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="reg-email" className="text-sm font-medium text-zinc-700">
          邮箱地址
        </label>
        <input
          id="reg-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) {
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next.email;
                return next;
              });
            }
          }}
          placeholder="you@example.com"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          aria-describedby={fieldErrors.email ? 'reg-email-error' : undefined}
          aria-invalid={fieldErrors.email ? 'true' : undefined}
        />
        {fieldErrors.email && (
          <p id="reg-email-error" className="text-xs text-red-600" role="alert">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reg-password" className="text-sm font-medium text-zinc-700">
          密码
        </label>
        <input
          id="reg-password"
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
          aria-describedby={fieldErrors.password ? 'reg-password-error' : undefined}
          aria-invalid={fieldErrors.password ? 'true' : undefined}
        />
        {fieldErrors.password && (
          <p id="reg-password-error" className="text-xs text-red-600" role="alert">
            {fieldErrors.password}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reg-confirm-password" className="text-sm font-medium text-zinc-700">
          确认密码
        </label>
        <input
          id="reg-confirm-password"
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
          placeholder="再次输入密码"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          aria-describedby={fieldErrors.confirmPassword ? 'reg-confirm-password-error' : undefined}
          aria-invalid={fieldErrors.confirmPassword ? 'true' : undefined}
        />
        {fieldErrors.confirmPassword && (
          <p id="reg-confirm-password-error" className="text-xs text-red-600" role="alert">
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
        {uiState === 'loading' ? '处理中…' : '注册'}
      </button>
    </form>
  );
}