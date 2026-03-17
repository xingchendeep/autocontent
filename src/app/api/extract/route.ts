import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';
import { getSession } from '@/lib/auth';
import { verifyApiKey } from '@/lib/api-keys';
import { checkRateLimit, buildRateLimitKey } from '@/lib/rate-limit';
import { getPlanCapability } from '@/lib/billing/plan-capability';
import { createServiceRoleClient } from '@/lib/db/client';
import { detectPlatform } from '@/lib/extract';

const extractSchema = z.object({
  videoUrl: z.string().url('请提供有效的视频 URL'),
  audioUrl: z.string().url().optional(),
  awemeId: z.string().regex(/^\d+$/).optional(),
});

/**
 * POST /api/extract
 * 创建视频脚本提取任务（异步）
 * 返回 jobId，客户端通过 GET /api/extract/:id 轮询结果
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
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

  // 解析请求体
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '请求体格式错误', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const parsed = extractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, parsed.error.issues[0]?.message ?? '参数错误', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const { videoUrl, audioUrl, awemeId } = parsed.data;
  const platform = detectPlatform(videoUrl);

  // 频率限制：免费用户每天 3 次，付费用户不限
  let planCode = 'free';
  try {
    const cap = await getPlanCapability(userId);
    planCode = cap.planCode;
  } catch {
    // fallback to free
  }

  const isPaid = planCode !== 'free';
  const isDev = process.env.NODE_ENV === 'development';
  if (!isPaid && !isDev) {
    const rl = await checkRateLimit(
      buildRateLimitKey('extract', 'user', userId, '1d'),
      3,
      86400, // 24 小时
    );
    if (!rl.allowed) {
      return NextResponse.json(
        createError(ERROR_CODES.RATE_LIMITED, '免费用户每天最多提取 3 次视频脚本，请明天再试或升级套餐', requestId, {
          retryAfter: rl.resetAt,
        }),
        { status: ERROR_STATUS.RATE_LIMITED, headers: { 'x-request-id': requestId } },
      );
    }
  }

  // 创建提取任务记录
  const db = createServiceRoleClient();
  const { data: job, error: insertError } = await db
    .from('extraction_jobs')
    .insert({
      user_id: userId,
      video_url: videoUrl,
      audio_url: audioUrl ?? null,
      platform,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError || !job) {
    return NextResponse.json(
      createError(ERROR_CODES.INTERNAL_ERROR, '创建提取任务失败', requestId),
      { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
    );
  }

  const jobId = (job as { id: string }).id;

  // 异步执行提取（不阻塞响应）
  processExtraction(jobId, videoUrl, audioUrl, platform, awemeId).catch((err) => {
    // 错误已在 processExtraction 内部处理并写入 DB
    console.error('extract: background processing error', err);
  });

  return NextResponse.json(
    createSuccess({ jobId, status: 'pending', platform }, requestId),
    { status: 202, headers: { 'x-request-id': requestId } },
  );
}

/** 后台异步执行提取逻辑 */
async function processExtraction(
  jobId: string,
  videoUrl: string,
  audioUrl: string | undefined,
  platform: string,
  awemeId?: string,
): Promise<void> {
  const db = createServiceRoleClient();

  // 标记为处理中
  await db
    .from('extraction_jobs')
    .update({ status: 'processing' })
    .eq('id', jobId);

  try {
    const { extractVideoScript } = await import('@/lib/extract');
    const result = await extractVideoScript(videoUrl, audioUrl, awemeId);

    await db
      .from('extraction_jobs')
      .update({
        status: 'completed',
        method: result.method,
        result_text: result.text,
        duration_seconds: result.durationSeconds ?? null,
        language: result.language ?? null,
      })
      .eq('id', jobId);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db
      .from('extraction_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
      })
      .eq('id', jobId);
  }
}
