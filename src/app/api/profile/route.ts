import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/db/client';
import { generateRequestId, createSuccess, createError, ERROR_STATUS } from '@/lib/errors';

const updateProfileSchema = z.object({
  displayName: z.string().max(100, '显示名称最多 100 个字符').optional(),
});

/** GET /api/profile — returns user profile + subscription info */
export async function GET() {
  const requestId = generateRequestId();
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError('UNAUTHORIZED', '请先登录', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED },
    );
  }

  const db = createServiceRoleClient();

  // Fetch profile
  const { data: profile } = await db
    .from('profiles')
    .select('display_name, created_at')
    .eq('id', session.id)
    .single();

  // Fetch current subscription + plan
  const { data: sub } = await db
    .from('subscriptions')
    .select('status, current_period_end, plan_id')
    .eq('user_id', session.id)
    .in('status', ['active', 'trialing', 'past_due', 'paused'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  let planInfo: { code: string; display_name: string } | null = null;
  if (sub?.plan_id) {
    const { data: p } = await db
      .from('plans')
      .select('code, display_name')
      .eq('id', sub.plan_id)
      .single();
    planInfo = p;
  }

  return NextResponse.json(createSuccess({
    email: session.email,
    displayName: profile?.display_name ?? null,
    createdAt: profile?.created_at ?? null,
    subscription: sub ? {
      planCode: planInfo?.code ?? 'free',
      planName: planInfo?.display_name ?? '免费版',
      status: sub.status,
      currentPeriodEnd: sub.current_period_end,
    } : null,
  }, requestId));
}

/** PATCH /api/profile — update display name */
export async function PATCH(request: NextRequest) {
  const requestId = generateRequestId();
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError('UNAUTHORIZED', '请先登录', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      createError('INVALID_INPUT', parsed.error.issues[0]?.message ?? '输入无效', requestId),
      { status: ERROR_STATUS.INVALID_INPUT },
    );
  }

  const db = createServiceRoleClient();
  const { error } = await db
    .from('profiles')
    .upsert({
      id: session.id,
      display_name: parsed.data.displayName ?? null,
    }, { onConflict: 'id' });

  if (error) {
    return NextResponse.json(
      createError('INTERNAL_ERROR', '更新失败', requestId),
      { status: 500 },
    );
  }

  return NextResponse.json(createSuccess({ updated: true }, requestId));
}
