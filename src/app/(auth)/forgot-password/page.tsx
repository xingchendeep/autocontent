import Link from 'next/link';
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';

export const metadata = {
  title: '忘记密码 — AutoContent Pro',
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-zinc-900">AutoContent Pro</h1>
          <p className="mt-1 text-sm text-zinc-500">重置您的密码</p>
        </div>

        <ForgotPasswordForm />

        <noscript>
          <p className="mt-4 text-center text-xs text-zinc-400">
            本页面需要启用 JavaScript 才能正常使用。
          </p>
        </noscript>

        <p className="mt-4 text-center text-sm text-zinc-500">
          <Link href="/login" className="text-zinc-900 underline hover:text-zinc-700">
            返回登录
          </Link>
        </p>
      </div>
    </main>
  );
}
