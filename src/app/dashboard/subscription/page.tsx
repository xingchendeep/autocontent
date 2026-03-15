import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/db/client';
import { getPlanCapability } from '@/lib/billing/plan-capability';
import type { SubscriptionStatus } from '@/types';
import SubscriptionPanel from '@/components/dashboard/SubscriptionPanel';

interface SubscriptionRow {
  status: string;
}

export default async function SubscriptionPage() {
  const session = await getSession();
  // Middleware already redirects unauthenticated users to /login
  if (!session) return null;

  const db = createServiceRoleClient();

  // Fetch plan capability and active subscription in parallel
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

  const subscriptionStatus = (subResult.data as SubscriptionRow | null)?.status as SubscriptionStatus | null;
  const planCode = capability?.planCode ?? 'free';
  const planDisplayName = capability?.displayName ?? 'Free';

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">订阅管理</h1>
      <SubscriptionPanel
        planCode={planCode}
        planDisplayName={planDisplayName}
        subscriptionStatus={subscriptionStatus}
      />
    </div>
  );
}
