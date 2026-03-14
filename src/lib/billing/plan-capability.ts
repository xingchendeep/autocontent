import type { PlanCapability } from '@/types';
import { createServiceRoleClient } from '@/lib/db/client';

type SpeedTier = 'standard' | 'fast' | 'priority' | 'dedicated';

interface PlanRow {
  code: string;
  display_name: string;
  platform_limit: number | null;
  monthly_generation_limit: number | null;
  has_history: boolean;
  has_api_access: boolean;
  has_team_access: boolean;
  speed_tier: SpeedTier;
}

function mapPlanRow(row: PlanRow): PlanCapability {
  return {
    planCode: row.code,
    displayName: row.display_name,
    maxPlatforms: row.platform_limit,
    monthlyGenerationLimit: row.monthly_generation_limit,
    canUseHistory: row.has_history,
    canUseApi: row.has_api_access,
    canUseTeam: row.has_team_access,
    speedTier: row.speed_tier,
  };
}

/**
 * Returns the PlanCapability for the given user.
 * Falls back to the free plan when no active subscription exists.
 * Throws on database errors — callers decide the fallback strategy.
 */
export async function getPlanCapability(userId: string): Promise<PlanCapability> {
  const db = createServiceRoleClient();

  // Check for an active subscription via the view (already JOINs plans for code/display_name)
  const { data: sub, error: subError } = await db
    .from('current_active_subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (subError) throw new Error(`getPlanCapability: subscription query failed: ${subError.message}`);

  // Resolve the plan_id to use — from subscription or free fallback
  let planQuery = db
    .from('plans')
    .select(
      'code, display_name, platform_limit, monthly_generation_limit, has_history, has_api_access, has_team_access, speed_tier',
    );

  if (sub?.plan_id) {
    planQuery = planQuery.eq('id', sub.plan_id);
  } else {
    planQuery = planQuery.eq('code', 'free');
  }

  const { data: plan, error: planError } = await planQuery.single();

  if (planError) throw new Error(`getPlanCapability: plan query failed: ${planError.message}`);

  return mapPlanRow(plan as PlanRow);
}
