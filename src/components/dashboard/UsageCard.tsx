'use client';

import { useEffect, useState } from 'react';
import type { UsageData, ApiSuccess, ApiError } from '@/types';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: UsageData };

const SPEED_TIER_LABELS: Record<string, string> = {
  standard:  '标准',
  fast:      '快速',
  priority:  '优先',
  dedicated: '专属',
};

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-3 h-4 w-1/3 rounded bg-zinc-200" />
      <div className="mb-2 h-3 w-1/2 rounded bg-zinc-100" />
      <div className="h-2 w-full rounded bg-zinc-100" />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
    >
      {message}
    </div>
  );
}

export default function UsageCard() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/usage')
      .then(async (res) => {
        const json = (await res.json()) as ApiSuccess<UsageData> | ApiError;
        if (!cancelled) {
          if (json.success) {
            setState({ status: 'ok', data: json.data });
          } else {
            setState({ status: 'error', message: json.error.message });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', message: '无法加载套餐信息' });
      });
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'loading') return <SkeletonCard />;
  if (state.status === 'error')   return <ErrorBanner message={state.message} />;

  const { plan, monthlyGenerationCount } = state.data;
  const limit = plan.monthlyGenerationLimit;
  const pct = limit != null ? Math.min(100, Math.round((monthlyGenerationCount / limit) * 100)) : null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold text-zinc-900">{plan.displayName}</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
          {SPEED_TIER_LABELS[plan.speedTier] ?? plan.speedTier}
        </span>
      </div>

      <p className="mb-2 text-sm text-zinc-600">
        本月已生成：<span className="font-medium text-zinc-900">{monthlyGenerationCount}</span> 次
      </p>

      {limit != null ? (
        <div>
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>{monthlyGenerationCount} / {limit} 次</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-zinc-800 transition-all"
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={monthlyGenerationCount}
              aria-valuemin={0}
              aria-valuemax={limit}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-400">无限制</p>
      )}
    </div>
  );
}
