import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/db/client';
import { checkRateLimit, buildRateLimitKey } from '@/lib/rate-limit';
import { getPlanCapability } from '@/lib/billing/plan-capability';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';

export const maxDuration = 30;

const bodySchema = z.object({
  publicUrl: z.string().url('无效的文件 URL'),
  storagePath: z.string().min(1),
});

/**
 * POST /api/extract/upload
 * 接收客户端直传 Supabase Storage 后的 publicUrl，创建 ASR 提取任务。
 * 文件本身由前端直接上传到 Supabase Storage，绕过 Vercel 4.5MB 请求体限制。
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '上传文件需要登录', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  const userId = session.id;

  // Rate limit
  let planCode = 'free';
  try {
    const cap = await getPlanCapability(userId);
    planCode = cap.planCode;
  } catch { /* fallback free */ }

  if (planCode === 'free' && process.env.NODE_ENV !== 'development') {
    const rl = await checkRateLimit(
      buildRateLimitKey('extract', 'user', userId, '1d'), 3, 86400,
    );
    if (!rl.allowed) {
      return NextResponse.json(
        createError(ERROR_CODES.RATE_LIMITED, '免费用户每天最多提取 3 次，请明天再试或升级套餐', requestId),
        { status: ERROR_STATUS.RATE_LIMITED, headers: { 'x-request-id': requestId } },
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '请求格式错误', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, parsed.error.issues[0]?.message ?? '参数错误', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const { publicUrl, storagePath } = parsed.data;

  // 验证 storagePath 属于当前用户（防止越权）
  if (!storagePath.startsWith(`${userId}/`)) {
    return NextResponse.json(
      createError(ERROR_CODES.FORBIDDEN, '无权访问该文件', requestId),
      { status: ERROR_STATUS.FORBIDDEN, headers: { 'x-request-id': requestId } },
    );
  }

  const db = createServiceRoleClient();

  const { data: job, error: insertError } = await db
    .from('extraction_jobs')
    .insert({
      user_id: userId,
      video_url: publicUrl,
      platform: 'upload',
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

  // 通过内部 HTTP 调用 /api/extract/process 来异步处理
  // 不能用 .catch() 异步启动，因为 Vercel 在响应返回后会冻结 serverless function
  const processUrl = `${req.nextUrl.origin}/api/extract/process`;
  fetch(processUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId,
      videoUrl: publicUrl,
      platform: 'upload',
      storagePath,
    }),
  }).catch((err) => {
    console.error('extract/upload: failed to dispatch process request', err);
  });

  return NextResponse.json(
    createSuccess({ jobId, status: 'pending', platform: 'upload' }, requestId),
    { status: 202, headers: { 'x-request-id': requestId } },
  );
}


