'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/auth/client';
import { loginFormSchema, emailSchema } from '@/lib/validations/auth';

type UIState = 'idle' | 'loading' | 'sent' | 'error';
type AuthMode = 'magic-link' | 'password';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('password');
  const [uiState, setUiState] = useState<UIState>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailError(null);
    setPasswordError(null);
    setErrorMessage(null);

    const supabase = createSupabaseBrowserClient();

    if (authMode === 'password') {
      const result = loginFormSchema.safeParse({ email, password });
      if (!result.success) {
        for (const issue of result.error.issues) {
          if (issue.path[0] === 'email') {
            setEmailError(issue.message);
          } else if (issue.path[0] === 'password') {
            setPasswordError(issue.message);
          }
        }
        return;
      }

      setUiState('loading');

      const { error } = await supabase.auth.signInWithPassword({
        email: result.data.email,
        password: result.data.password,
      });

      if (error) {
        setUiState('error');
        if (error.message === 'Invalid login credentials') {
          setErrorMessage('邮箱或密码错误，请重试');
        } else {
          setErrorMessage(error.message || '登录失败，请稍后重试');
        }
        return;
      }

      window.location.href = '/';
      return;
    }

    // Magic link flow — validate email only
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      setEmailError(emailResult.error.issues[0]?.message ?? '邮箱格式无效');
      return;
    }

    setUiState('loading');

    const { error } = await supabase.auth.signInWithOtp({
      email: emailResult.data,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
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
            if (emailError) setEmailError(null);
          }}
          placeholder="you@example.com"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          aria-describedby={emailError ? 'email-error' : undefined}
          aria-invalid={emailError ? 'true' : undefined}
        />
        {emailError && (
          <p id="email-error" className="text-xs text-red-600" role="alert">
            {emailError}
          </p>
        )}
      </div>

      {authMode === 'password' && (
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-zinc-700">
            密码
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError(null);
            }}
            placeholder="输入密码"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            aria-describedby={passwordError ? 'password-error' : undefined}
            aria-invalid={passwordError ? 'true' : undefined}
          />
          {passwordError && (
            <p id="password-error" className="text-xs text-red-600" role="alert">
              {passwordError}
            </p>
          )}
        </div>
      )}

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
        {uiState === 'loading'
          ? '处理中…'
          : authMode === 'password'
            ? '登录'
            : '发送登录链接'}
      </button>

      {authMode === 'password' && (
        <Link
          href="/forgot-password"
          className="text-center text-xs text-zinc-400 hover:text-zinc-600"
        >
          忘记密码？
        </Link>
      )}

      <button
        type="button"
        onClick={() => {
          setAuthMode(authMode === 'password' ? 'magic-link' : 'password');
          setEmailError(null);
          setPasswordError(null);
          setErrorMessage(null);
          setUiState('idle');
        }}
        className="text-xs text-zinc-400 hover:text-zinc-600"
      >
        {authMode === 'password' ? '使用邮箱链接登录' : '使用密码登录'}
      </button>
    </form>
  );
}
