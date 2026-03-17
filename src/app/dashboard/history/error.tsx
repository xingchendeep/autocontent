'use client';

export default function HistoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-8 text-center">
        <p className="mb-1 text-sm font-medium text-red-700">加载生成记录失败</p>
        <p className="mb-4 text-xs text-red-500">{error.message}</p>
        <button
          onClick={reset}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          重试
        </button>
      </div>
    </div>
  );
}
