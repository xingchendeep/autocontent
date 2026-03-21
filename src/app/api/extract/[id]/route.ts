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

// Allow up to 120 seconds for extraction processing (Vercel Pro)
export const maxDuration = 120;

/**
 * GET /api/extract/:id
 * 查询视频脚本提取任务状态
 * 如果任务还是 pending，在此请求中同步执行提取（避免 Vercel 杀后台任务）
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const requestId = generateRequestId();

  // Auth
  let userId: string | null = null;
  const authHeader = req.headers.get('authorization') ?? '';
  const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (rawKey) userId = await verifyApiKey(rawKey);
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
    .select('id, user_id, video_url, audio_url, platform, status, method, result_text, duration_seconds, language, error_message, created_at, updated_at')
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
    id: string; user_id: string; video_url: string; audio_url: string | null;
    platform: string; status: string; method: string | null;
    result_text: string | null; duration_seconds: number | null;
    language: string | null; error_message: string | null;
    created_at: string; updated_at: string;
  };

  if (row.user_id !== userId) {
    return NextResponse.json(
      createError(ERROR_CODES.NOT_FOUND, '任务不存在', requestId),
      { status: ERROR_STATUS.NOT_FOUND, headers: { 'x-request-id': requestId } },
    );
  }

  // If job is still pending, trigger processing synchronously in this request
  if (row.status === 'pending' || row.status === 'processing') {
    // Only process if still pending (avoid double processing)
    if (row.status === 'pending') {
      await db.from('extraction_jobs').update({ status: 'processing' }).eq('id', jobId);

      try {
        let result: { text: string; method: string; durationSeconds?: number; language?: string };

        if (row.platform === 'upload') {
          // Upload jobs: video_url is already the direct file URL, call ASR directly
          const { transcribeAudio } = await import('@/lib/extract/asr-service');
          result = await transcribeAudio(row.video_url);
        } else {
          const { extractVideoScript } = await import('@/lib/extract');
          // Extract awemeId from video URL for douyin
          let awemeId: string | undefined;
          if (row.platform === 'douyin') {
            const videoMatch = row.video_url.match(/\/video\/(\d+)/);
            const modalMatch = row.video_url.match(/modal_id=(\d+)/);
            awemeId = videoMatch?.[1] ?? modalMatch?.[1] ?? undefined;
          }
          result = await extractVideoScript(row.video_url, row.audio_url ?? undefined, awemeId);
        }

        await db.from('extraction_jobs').update({
          status: 'completed',
          method: result.method,
          result_text: result.text,
          duration_seconds: result.durationSeconds ?? null,
          language: result.language ?? null,
        }).eq('id', jobId);

        // Clean up uploaded file from Supabase Storage (audio_url stores the storage path)
        if (row.platform === 'upload' && row.audio_url) {
          await db.storage.from('temp-videos').remove([row.audio_url]).catch(() => {});
        }

        return NextResponse.json(createSuccess({
          jobId: row.id, status: 'completed', platform: row.platform,
          videoUrl: row.video_url, createdAt: row.created_at, updatedAt: new Date().toISOString(),
          result: { text: result.text, method: result.method, durationSeconds: result.durationSeconds, language: result.language },
        }, requestId), { status: 200, headers: { 'x-request-id': requestId } });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await db.from('extraction_jobs').update({ status: 'failed', error_message: errorMessage }).eq('id', jobId);

        // Clean up uploaded file even on failure
        if (row.platform === 'upload' && row.audio_url) {
          await db.storage.from('temp-videos').remove([row.audio_url]).catch(() => {});
        }

        return NextResponse.json(createSuccess({
          jobId: row.id, status: 'failed', platform: row.platform,
          videoUrl: row.video_url, createdAt: row.created_at, updatedAt: new Date().toISOString(),
          error: errorMessage,
        }, requestId), { status: 200, headers: { 'x-request-id': requestId } });
      }
    }

    // If processing (another request is handling it), just return current status
    return NextResponse.json(createSuccess({
      jobId: row.id, status: row.status, platform: row.platform,
      videoUrl: row.video_url, createdAt: row.created_at, updatedAt: row.updated_at,
    }, requestId), { status: 200, headers: { 'x-request-id': requestId } });
  }

  // Completed or failed — return result
  const responseData: Record<string, unknown> = {
    jobId: row.id, status: row.status, platform: row.platform,
    videoUrl: row.video_url, createdAt: row.created_at, updatedAt: row.updated_at,
  };
  if (row.status === 'completed') {
    responseData.result = {
      text: row.result_text, method: row.method,
      durationSeconds: row.duration_seconds, language: row.language,
    };
  }
  if (row.status === 'failed') {
    responseData.error = row.error_message;
  }

  return NextResponse.json(createSuccess(responseData, requestId), {
    status: 200, headers: { 'x-request-id': requestId },
  });
}
