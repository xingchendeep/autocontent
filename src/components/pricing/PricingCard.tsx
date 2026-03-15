'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PricingPlan, ApiSuccess, ApiError, CheckoutResponseData } from '@/types';

interface Props {
  plan: PricingPlan;
  isLoggedIn: boolean;
  currentPlanCode: string | null;
}

const SPEED_TIER_LABELS: Record<string, string> = {
  standard:  '标准',
  fast:      '快速',
  priority:  '优先',
  dedicated: '专属',
};

function formatPrice(cents: number): string {
  if (cents === 0) return '免费';
  return `¥${(cents / 100).toFixed(0)}/月`;
}

export default function PricingCard({ plan, isLoggedIn, currentPlanCode }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCurrent = currentPlanCode === plan.code;
  const isFree = plan.code === 'free';

  async function handleUpgrade() {
    setError(null);

    if (!isLoggedIn) {
      router.push('/login');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planCode: plan.code,
          successUrl: `${window.location.origin}/dashboard?upgraded=1`,
          cancelUrl: window.location.href,
        }),
      });

      const json = (await res.json()) as ApiSuccess<CheckoutResponseData> | ApiError;

      if (!json.success) {
        setError(json.error.message ?? '结账失败，请稍后重试');
        return;
      }

      window.location.href = json.data.checkoutUrl;
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`flex flex-col rounded-xl border p-6 ${
        isCurrent
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-200 bg-white text-zinc-900'
      }`}
    >
      {/* Plan name + speed tier */}
      <div className="mb-1 flex items-center gap-2">
        <span className="font-semibold">{plan.displayName}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            isCurrent ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-100 text-zinc-600'
          }`}
        >
          {SPEED_TIER_LABELS[plan.speedTier] ?? plan.speedTier}
        </span>
      </div>

      {/* Price */}
      <p className="mb-4 text-2xl font-bold">{formatPrice(plan.priceMonthly)}</p>

      {/* Limits */}
      <ul className={`mb-6 flex-1 space-y-1 text-sm ${isCurrent ? 'text-zinc-300' : 'text-zinc-600'}`}>
        <li>
          {plan.monthlyGenerationLimit != null
            ? `每月 ${plan.monthlyGenerationLimit} 次生成`
            : '无限次生成'}
        </li>
        <li>
          {plan.platformLimit != null
            ? `最多 ${plan.platformLimit} 个平台`
            : '全部平台'}
        </li>
      </ul>

      {/* Error */}
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
      )}

      {/* CTA */}
      {isCurrent ? (
        <span className="rounded-lg bg-zinc-700 px-4 py-2 text-center text-sm font-medium text-zinc-200">
          当前套餐
        </span>
      ) : isFree ? (
        <span className="rounded-lg border border-zinc-200 px-4 py-2 text-center text-sm text-zinc-400">
          免费使用
        </span>
      ) : (
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? '处理中…' : '立即升级'}
        </button>
      )}
    </div>
  );
}
