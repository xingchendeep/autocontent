import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SUPPORTED_PLATFORMS } from '@/lib/ai/templates';
import { getSession } from '@/lib/auth';
import { getPlanCapability } from '@/lib/billing/plan-capability';
import { createServiceRoleClient } from '@/lib/db/client';
import { enqueueJob } from '@/lib/queue';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { PlatformCode } from '@/types';

const platformCodeSchema = z.enum(
  SUPPORTED_PLATFORMS as [PlatformCode, ...PlatformCode[]],
);

const batchSchema = z.object({
  items: z
    .array(
      z.object({
        content: z.string().min(1).max(100000),
        platforms: z.array(platformCodeSchema).min(1).max(10),
      }),
    )
    .min(1)
    .max(50),
  templateId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  // Auth required
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '未认证', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  // Parse + validate body first — no DB writes on failure
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, 'Request body must be valid JSON', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '请求参数无效', requestId, {
        details: parsed.error.flatten(),
      }),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  // Plan capability check
  let capability;
  try {
    capability = await getPlanCapability(session.id);
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.SERVICE_UNAVAILABLE, '无法获取套餐信息', requestId),
      { status: ERROR_STATUS.SERVICE_UNAVAILABLE, headers: { 'x-request-id': requestId } },
    );
  }

  if (!capability.canUseBatch) {
    return NextResponse.json(
      createError(ERROR_CODES.PLAN_LIMIT_REACHED, '当前套餐不支持批量生成', requestId),
      { status: ERROR_STATUS.PLAN_LIMIT_REACHED, headers: { 'x-request-id': requestId } },
    );
  }

  const { items, templateId } = parsed.data;
  const db = createServiceRoleClient();

  // Collect all unique platforms across items for the job record
  const allPlatforms = [...new Set(items.flatMap((i) => i.platforms))];

  // Create batch_jobs record
  const { data: job, error: jobError } = await db
    .from('batch_jobs')
    .insert({
      user_id: session.id,
      status: 'pending',
      item_count: items.length,
      platforms: allPlatforms,
      template_id: templateId ?? null,
    })
    .select('id')
    .single();

  if (jobError || !job) {
    logger.error('batch: failed to create batch_jobs record', { requestId, error: jobError?.message });
    return NextResponse.json(
      createError(ERROR_CODES.SERVICE_UNAVAILABLE, '创建批量任务失败', requestId),
      { status: ERROR_STATUS.SERVICE_UNAVAILABLE, headers: { 'x-request-id': requestId } },
    );
  }

  const jobId = (job as { id: string }).id;

  // Create batch_job_items records
  const itemRows = items.map((item) => ({
    job_id: jobId,
    user_id: session.id,
    status: 'pending' as const,
    input_content: item.content,
  }));

  const { data: createdItems, error: itemsError } = await db
    .from('batch_job_items')
    .insert(itemRows)
    .select('id');

  if (itemsError || !createdItems) {
    logger.error('batch: failed to create batch_job_items', { requestId, jobId, error: itemsError?.message });
    return NextResponse.json(
      createError(ERROR_CODES.SERVICE_UNAVAILABLE, '创建批量任务子项失败', requestId),
      { status: ERROR_STATUS.SERVICE_UNAVAILABLE, headers: { 'x-request-id': requestId } },
    );
  }

  // Enqueue each item — failures are fire-and-forget, do not affect 202
  for (const item of createdItems as { id: string }[]) {
    void enqueueJob(jobId, { jobId, itemId: item.id, retryCount: 0 });
  }

  logger.info('batch: job created', { requestId, jobId, itemCount: items.length });

  return NextResponse.json(
    createSuccess({ jobId, itemCount: items.length, status: 'pending' }, requestId),
    { status: 202, headers: { 'x-request-id': requestId } },
  );
}
