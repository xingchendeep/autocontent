import LoginForm from '@/components/auth/LoginForm';

export const metadata = {
  title: '登录 — AutoContent Pro',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-zinc-900">AutoContent Pro</h1>
          <p className="mt-1 text-sm text-zinc-500">
            输入邮箱，我们将向您发送一条免密登录链接
          </p>
        </div>

        <LoginForm />

        <noscript>
          <p className="mt-4 text-center text-xs text-zinc-400">
            本页面需要启用 JavaScript 才能正常使用。
          </p>
        </noscript>
      </div>
    </main>
  );
}
