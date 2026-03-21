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

export const maxDuration = 60;

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

  // 直接提交 ASR 任务（upload 的 publicUrl 已经是 Supabase Storage 直链）
  await db.from('extraction_jobs').update({ status: 'processing' }).eq('id', jobId);

  try {
    const { submitTranscriptionTask } = await import('@/lib/extract/asr-service');
    const taskId = await submitTranscriptionTask(publicUrl);

    await db.from('extraction_jobs').update({ asr_task_id: taskId }).eq('id', jobId);

    // 清理 storage 文件（延迟，等 ASR 下载完）
    // 实际上 ASR 是异步的，提交后 DashScope 会立即下载文件，所以可以稍后清理
    // 但为安全起见，不在这里清理，让 ASR 完成后再清理
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.from('extraction_jobs').update({
      status: 'failed',
      error_message: errorMessage,
    }).eq('id', jobId);

    // 清理 storage 文件
    await db.storage.from('temp-videos').remove([storagePath]).catch(() => {});

    return NextResponse.json(
      createSuccess({ jobId, status: 'failed', platform: 'upload', error: errorMessage }, requestId),
      { status: 200, headers: { 'x-request-id': requestId } },
    );
  }

  return NextResponse.json(
    createSuccess({ jobId, status: 'processing', platform: 'upload' }, requestId),
    { status: 202, headers: { 'x-request-id': requestId } },
  );
}


