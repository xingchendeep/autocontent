import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/db/client';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const requestId = generateRequestId();

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '未认证', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  const { id: jobId } = await ctx.params;
  const db = createServiceRoleClient();

  const { data: job, error: jobError } = await db
    .from('batch_jobs')
    .select('id, user_id, status, item_count, completed_count, failed_count, created_at, updated_at')
    .eq('id', jobId)
    .maybeSingle();

  if (jobError) {
    return NextResponse.json(
      createError(ERROR_CODES.SERVICE_UNAVAILABLE, '查询失败', requestId),
      { status: ERROR_STATUS.SERVICE_UNAVAILABLE, headers: { 'x-request-id': requestId } },
    );
  }

  if (!job) {
    return NextResponse.json(
      createError(ERROR_CODES.NOT_FOUND, '任务不存在', requestId),
      { status: ERROR_STATUS.NOT_FOUND, headers: { 'x-request-id': requestId } },
    );
  }

  const jobRow = job as {
    id: string;
    user_id: string;
    status: string;
    item_count: number;
    completed_count: number;
    failed_count: number;
    created_at: string;
    updated_at: string;
  };

  // Ownership check
  if (jobRow.user_id !== session.id) {
    return NextResponse.json(
      createError(ERROR_CODES.NOT_FOUND, '任务不存在', requestId),
      { status: ERROR_STATUS.NOT_FOUND, headers: { 'x-request-id': requestId } },
    );
  }

  const responseData: Record<string, unknown> = {
    jobId: jobRow.id,
    status: jobRow.status,
    itemCount: jobRow.item_count,
    completedCount: jobRow.completed_count,
    failedCount: jobRow.failed_count,
    createdAt: jobRow.created_at,
    updatedAt: jobRow.updated_at,
  };

  // Include items array for terminal states
  if (jobRow.status === 'completed' || jobRow.status === 'partial') {
    const { data: items, error: itemsError } = await db
      .from('batch_job_items')
      .select('id, status, results')
      .eq('job_id', jobId);

    if (!itemsError && items) {
      responseData.items = (items as { id: string; status: string; results: unknown }[]).map(
        (item) => ({
          itemId: item.id,
          status: item.status,
          results: item.results ?? null,
        }),
      );
    }
  }

  return NextResponse.json(createSuccess(responseData, requestId), {
    status: 200,
    headers: { 'x-request-id': requestId },
  });
}
