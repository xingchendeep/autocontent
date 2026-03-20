import Link from 'next/link';
import UsageCard from '@/components/dashboard/UsageCard';
import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/db/client';
import { getPlanCapability } from '@/lib/billing/plan-capability';
import type { SubscriptionStatus } from '@/types';
import SubscriptionPanel from '@/components/dashboard/SubscriptionPanel';

interface SubscriptionRow {
  status: string;
}

export default async function DashboardPage() {
  const session = await getSession();

  let planCode = 'free';
  let planDisplayName = 'Free';
  let subscriptionStatus: SubscriptionStatus | null = null;

  if (session) {
    const db = createServiceRoleClient();
    const [capability, subResult] = await Promise.all([
      getPlanCapability(session.id).catch(() => null),
      db
        .from('subscriptions')
        .select('status')
        .eq('user_id', session.id)
        .in('status', ['active', 'trialing', 'past_due', 'paused', 'cancelled', 'expired'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    subscriptionStatus = (subResult.data as SubscriptionRow | null)?.status as SubscriptionStatus | null;
    planCode = capability?.planCode ?? 'free';
    planDisplayName = capability?.displayName ?? 'Free';
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">控制台</h1>
        <Link
          href="/dashboard/history"
          className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline"
        >
          查看生成记录 →
        </Link>
      </div>

      <UsageCard />

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">订阅管理</h2>
        <SubscriptionPanel
          planCode={planCode}
          planDisplayName={planDisplayName}
          subscriptionStatus={subscriptionStatus}
        />
      </div>


    </div>
  );
}
