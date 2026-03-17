import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { verifyApiKey } from '@/lib/api-keys';
import { createServiceRoleClient } from '@/lib/db/client';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/extract/:id
 * 查询视频脚本提取任务状态
 * 支持 session 认证和 API Key 认证
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const requestId = generateRequestId();

  // 认证：支持 session 或 API Key
  let userId: string | null = null;

  const authHeader = req.headers.get('authorization') ?? '';
  const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (rawKey) {
    userId = await verifyApiKey(rawKey);
  }

  if (!userId) {
    const session = await getSession();
    userId = session?.id ?? null;
  }

  if (!userId) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '请先登录或提供 API Key', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  const { id: jobId } = await ctx.params;
  const db = createServiceRoleClient();

  const { data: job, error } = await db
    .from('extraction_jobs')
    .select('id, user_id, video_url, platform, status, method, result_text, duration_seconds, language, error_message, created_at, updated_at')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
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

  const row = job as {
    id: string;
    user_id: string;
    video_url: string;
    platform: string;
    status: string;
    method: string | null;
    result_text: string | null;
    duration_seconds: number | null;
    language: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
  };

  // 所有权检查
  if (row.user_id !== userId) {
    return NextResponse.json(
      createError(ERROR_CODES.NOT_FOUND, '任务不存在', requestId),
      { status: ERROR_STATUS.NOT_FOUND, headers: { 'x-request-id': requestId } },
    );
  }

  const responseData: Record<string, unknown> = {
    jobId: row.id,
    status: row.status,
    platform: row.platform,
    videoUrl: row.video_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.status === 'completed') {
    responseData.result = {
      text: row.result_text,
      method: row.method,
      durationSeconds: row.duration_seconds,
      language: row.language,
    };
  }

  if (row.status === 'failed') {
    responseData.error = row.error_message;
  }

  return NextResponse.json(createSuccess(responseData, requestId), {
    status: 200,
    headers: { 'x-request-id': requestId },
  });
}
