'use client';

import { useState, useEffect, useRef } from 'react';

interface GenerateButtonProps {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
}

export default function GenerateButton({ onClick, loading, disabled }: GenerateButtonProps) {
  const isDisabled = loading || disabled;
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClick}
          disabled={isDisabled}
          aria-busy={loading}
          title={disabled && !loading ? '请至少选择一个平台' : undefined}
          className={[
            'flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-blue-300',
            isDisabled
              ? 'cursor-not-allowed bg-zinc-200 text-zinc-400'
              : 'bg-blue-600 text-white hover:bg-blue-700',
          ].join(' ')}
        >
          {loading && (
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {loading ? `生成中… ${elapsed}s` : '一键生成'}
        </button>
      </div>

      {/* Progress bar during generation */}
      {loading && (
        <div className="w-full max-w-[240px]">
          <div className="h-1.5 w-full rounded-full bg-zinc-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-1000 ease-linear"
              style={{ width: `${Math.min((elapsed / 30) * 100, 95)}%` }}
            />
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            {elapsed < 10 ? '正在分析内容...' : elapsed < 20 ? '正在生成各平台文案...' : '即将完成，请稍候...'}
          </p>
        </div>
      )}
    </div>
  );
}
