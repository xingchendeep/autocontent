import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/auth/server';
import { getPlanCapability } from '@/lib/billing/plan-capability';
import { generateRequestId, createSuccess, createError, ERROR_CODES, ERROR_STATUS } from '@/lib/errors';
import type { UsageData } from '@/types';

export async function GET(): Promise<NextResponse> {
  const requestId = generateRequestId();

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  const { id: userId } = session;
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Parallel: fetch usage_stats + plan capability
  const db = await createSupabaseServerClient();
  const [statsResult, capabilityResult] = await Promise.all([
    db.from('usage_stats').select('*').eq('user_id', userId).maybeSingle(),
    getPlanCapability(userId).then(
      (v) => ({ ok: true as const, value: v }),
      (e: unknown) => ({ ok: false as const, error: e }),
    ),
  ]);

  if (!capabilityResult.ok) {
    return NextResponse.json(
      createError(ERROR_CODES.INTERNAL_ERROR, 'Failed to fetch plan capability', requestId),
      { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
    );
  }

  const capability = capabilityResult.value;

  const stats = statsResult.data;

  const usageData: UsageData = {
    currentMonth: stats?.current_month ?? currentMonth,
    monthlyGenerationCount: stats?.monthly_generation_count ?? 0,
    totalGenerationCount: stats?.total_generation_count ?? 0,
    lastGenerationAt: stats?.last_generation_at ?? null,
    plan: {
      code: capability.planCode,
      displayName: capability.displayName,
      monthlyGenerationLimit: capability.monthlyGenerationLimit,
      platformLimit: capability.maxPlatforms,
      speedTier: capability.speedTier,
    },
  };

  return NextResponse.json(
    createSuccess(usageData, requestId),
    { status: 200, headers: { 'x-request-id': requestId } },
  );
}
