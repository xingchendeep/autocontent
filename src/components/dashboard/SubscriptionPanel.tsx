'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SubscriptionStatus, ApiSuccess, ApiError, CheckoutResponseData } from '@/types';

interface Props {
  planCode: string;
  planDisplayName: string;
  subscriptionStatus: SubscriptionStatus | null;
}

export default function SubscriptionPanel({ planCode, planDisplayName, subscriptionStatus }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade(targetPlanCode: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planCode: targetPlanCode,
          successUrl: `${window.location.origin}/dashboard?upgraded=1`,
          cancelUrl: window.location.href,
        }),
      });

      const json = (await res.json()) as ApiSuccess<CheckoutResponseData> | ApiError;

      if (!json.success) {
        setError(json.error.message ?? '操作失败，请稍后重试');
        return;
      }

      window.location.href = json.data.checkoutUrl;
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const isTerminal = subscriptionStatus === 'cancelled' || subscriptionStatus === 'expired';
  const isProblematic = subscriptionStatus === 'past_due' || subscriptionStatus === 'paused';
  const isFree = planCode === 'free' && !subscriptionStatus;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6">
      {/* Current plan header */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-base font-semibold text-zinc-900">{planDisplayName}</span>
        {subscriptionStatus && (
          <StatusBadge status={subscriptionStatus} />
        )}
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Active / Trialing */}
      {isActive && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">您的订阅当前有效。</p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleUpgrade('studio')}
              disabled={loading}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {loading ? '处理中…' : '升级套餐'}
            </button>
            <Link
              href="/pricing"
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:border-zinc-400"
            >
              查看所有套餐
            </Link>
          </div>
          <p className="text-xs text-zinc-400">
            如需取消订阅，请通过 Creem.io 客户门户操作。
          </p>
        </div>
      )}

      {/* Cancelled / Expired */}
      {isTerminal && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            {subscriptionStatus === 'cancelled' ? '您的订阅已取消。' : '您的订阅已到期。'}
            重新订阅以继续使用高级功能。
          </p>
          <Link
            href="/pricing"
            className="inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            重新订阅
          </Link>
        </div>
      )}

      {/* Past due / Paused */}
      {isProblematic && (
        <div className="rounded-lg bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800">
            {subscriptionStatus === 'past_due'
              ? '您的账单存在逾期未付款项，请更新付款方式以继续使用服务。'
              : '您的订阅已暂停，请联系支持团队了解详情。'}
          </p>
        </div>
      )}

      {/* Free / No subscription */}
      {isFree && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">您当前使用免费套餐。升级以解锁更多功能。</p>
          <Link
            href="/pricing"
            className="inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            查看套餐
          </Link>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const config: Record<SubscriptionStatus, { label: string; className: string }> = {
    active:    { label: '有效',   className: 'bg-green-100 text-green-700' },
    trialing:  { label: '试用中', className: 'bg-blue-100 text-blue-700' },
    cancelled: { label: '已取消', className: 'bg-zinc-100 text-zinc-600' },
    expired:   { label: '已到期', className: 'bg-zinc-100 text-zinc-600' },
    past_due:  { label: '逾期',   className: 'bg-amber-100 text-amber-700' },
    paused:    { label: '已暂停', className: 'bg-amber-100 text-amber-700' },
  };

  const { label, className } = config[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
