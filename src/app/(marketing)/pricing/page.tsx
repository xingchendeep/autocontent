import { createServiceRoleClient } from '@/lib/db/client';
import { getSession } from '@/lib/auth';
import PricingCard from '@/components/pricing/PricingCard';
import type { PricingPlan } from '@/types';

export const dynamic = 'force-dynamic';

interface PlanRow {
  code: string;
  display_name: string;
  price_cents: number;
  monthly_generation_limit: number | null;
  platform_limit: number | null;
  speed_tier: string;
  is_active: boolean;
}

export default async function PricingPage() {
  const db = createServiceRoleClient();

  const { data: rows } = await db
    .from('plans')
    .select('code, display_name, price_cents, monthly_generation_limit, platform_limit, speed_tier, is_active')
    .eq('is_active', true)
    .order('price_cents', { ascending: true });

  const plans: PricingPlan[] = (rows as PlanRow[] ?? []).map((r) => ({
    code: r.code,
    displayName: r.display_name,
    priceMonthly: r.price_cents,
    monthlyGenerationLimit: r.monthly_generation_limit,
    platformLimit: r.platform_limit,
    speedTier: r.speed_tier as PricingPlan['speedTier'],
  }));

  const session = await getSession();
  const currentPlanCode = session ? null : null; // resolved client-side via /api/usage for logged-in users

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="mb-2 text-center text-2xl font-bold text-zinc-900">选择套餐</h1>
      <p className="mb-10 text-center text-sm text-zinc-500">按月订阅，随时取消</p>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <PricingCard
            key={plan.code}
            plan={plan}
            isLoggedIn={!!session}
            currentPlanCode={currentPlanCode}
          />
        ))}
      </div>
    </div>
  );
}
