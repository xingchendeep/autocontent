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

export const maxDuration = 60;

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

  // 直接在当前请求中执行提取的第一阶段：
  // 解析视频 URL → 代理下载 → 上传 OSS → 提交 ASR 任务 → 保存 task_id
  // ASR 结果由前端 poll GET /api/extract/[id] 时逐步检查
  await db.from('extraction_jobs').update({ status: 'processing' }).eq('id', jobId);

  try {
    // B站：先尝试字幕 API（同步完成）
    if (platform === 'bilibili') {
      const { extractBilibiliSubtitle } = await import('@/lib/extract/bilibili-subtitle');
      const subtitleResult = await extractBilibiliSubtitle(videoUrl);
      if (subtitleResult) {
        await db.from('extraction_jobs').update({
          status: 'completed',
          method: subtitleResult.method,
          result_text: subtitleResult.text,
          duration_seconds: subtitleResult.durationSeconds ?? null,
          language: subtitleResult.language ?? null,
        }).eq('id', jobId);

        return NextResponse.json(
          createSuccess({ jobId, status: 'completed', platform, result: { text: subtitleResult.text, method: subtitleResult.method } }, requestId),
          { status: 200, headers: { 'x-request-id': requestId } },
        );
      }
      // 字幕失败，继续 ASR
    }

    // ASR 流程：解析视频直链 → 代理下载 → 上传 OSS → 提交 ASR（不轮询）
    let mediaUrl = audioUrl;

    if (!mediaUrl) {
      const { resolveVideoUrl } = await import('@/lib/extract');
      const resolvedAwemeId = awemeId
        ?? videoUrl.match(/\/video\/(\d+)/)?.[1]
        ?? videoUrl.match(/modal_id=(\d+)/)?.[1]
        ?? undefined;
      mediaUrl = (await resolveVideoUrl(videoUrl, platform, resolvedAwemeId)) ?? undefined;
    }

    if (!mediaUrl) {
      await db.from('extraction_jobs').update({
        status: 'failed',
        error_message: '无法自动获取视频地址。请尝试使用浏览器扩展提取，或换一个视频链接。',
      }).eq('id', jobId);

      return NextResponse.json(
        createSuccess({ jobId, status: 'failed', platform, error: '无法自动获取视频地址' }, requestId),
        { status: 200, headers: { 'x-request-id': requestId } },
      );
    }

    const { proxyDownloadVideo, cleanupTempFile } = await import('@/lib/extract/video-proxy');
    const proxy = await proxyDownloadVideo(mediaUrl, platform);

    const { submitTranscriptionTask } = await import('@/lib/extract/asr-service');
    const taskId = await submitTranscriptionTask(proxy.publicUrl, { isOssPrefix: proxy.isOssPrefix });

    await db.from('extraction_jobs').update({ asr_task_id: taskId }).eq('id', jobId);

    cleanupTempFile(proxy.fileId).catch(() => {});

    return NextResponse.json(
      createSuccess({ jobId, status: 'processing', platform }, requestId),
      { status: 202, headers: { 'x-request-id': requestId } },
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.from('extraction_jobs').update({
      status: 'failed',
      error_message: errorMessage,
    }).eq('id', jobId);

    return NextResponse.json(
      createSuccess({ jobId, status: 'failed', platform, error: errorMessage }, requestId),
      { status: 200, headers: { 'x-request-id': requestId } },
    );
  }
}


