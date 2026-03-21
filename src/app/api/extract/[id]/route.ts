import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { verifyApiKey } from '@/lib/api-keys';
import { createServiceRoleClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';

export const maxDuration = 60;
export const preferredRegion = 'hkg1';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/extract/:id
 * 查询视频脚本提取任务状态
 * - 如果 status=processing 且有 asr_task_id，检查一次 ASR 任务状态
 * - 如果 ASR 完成，更新 DB 并返回结果
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
    .select('id, user_id, video_url, platform, status, method, result_text, duration_seconds, language, error_message, asr_task_id, created_at, updated_at')
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
    id: string; user_id: string; video_url: string;
    platform: string; status: string; method: string | null;
    result_text: string | null; duration_seconds: number | null;
    language: string | null; error_message: string | null;
    asr_task_id: string | null;
    created_at: string; updated_at: string;
  };

  if (row.user_id !== userId) {
    return NextResponse.json(
      createError(ERROR_CODES.NOT_FOUND, '任务不存在', requestId),
      { status: ERROR_STATUS.NOT_FOUND, headers: { 'x-request-id': requestId } },
    );
  }

  // 如果 status=processing 且有 asr_task_id，检查 ASR 任务状态
  if (row.status === 'processing' && row.asr_task_id) {
    try {
      const asrResult = await checkAsrTaskStatus(row.asr_task_id);

      if (asrResult.status === 'completed' && asrResult.text) {
        await db.from('extraction_jobs').update({
          status: 'completed',
          method: 'asr',
          result_text: asrResult.text,
          duration_seconds: asrResult.durationSeconds ?? null,
          language: asrResult.language ?? null,
        }).eq('id', jobId);

        return NextResponse.json(createSuccess({
          jobId: row.id, status: 'completed', platform: row.platform,
          videoUrl: row.video_url, createdAt: row.created_at, updatedAt: new Date().toISOString(),
          result: {
            text: asrResult.text, method: 'asr',
            durationSeconds: asrResult.durationSeconds, language: asrResult.language,
          },
        }, requestId), {
          status: 200, headers: { 'x-request-id': requestId },
        });
      }

      if (asrResult.status === 'failed') {
        await db.from('extraction_jobs').update({
          status: 'failed',
          error_message: asrResult.error ?? 'ASR 转写失败',
        }).eq('id', jobId);

        return NextResponse.json(createSuccess({
          jobId: row.id, status: 'failed', platform: row.platform,
          videoUrl: row.video_url, createdAt: row.created_at, updatedAt: new Date().toISOString(),
          error: asrResult.error ?? 'ASR 转写失败',
        }, requestId), {
          status: 200, headers: { 'x-request-id': requestId },
        });
      }

      // still processing — fall through to return current status
    } catch (err) {
      logger.warn('extract/[id]: ASR status check failed', { jobId, error: String(err) });
      // Don't fail the request, just return current status
    }
  }

  // 超时检测：processing 超过 5 分钟视为失败
  if (row.status === 'processing' && Date.now() - new Date(row.updated_at).getTime() > 5 * 60_000) {
    await db.from('extraction_jobs').update({
      status: 'failed',
      error_message: '提取超时，请重试',
    }).eq('id', jobId);

    return NextResponse.json(createSuccess({
      jobId: row.id, status: 'failed', platform: row.platform,
      videoUrl: row.video_url, createdAt: row.created_at, updatedAt: new Date().toISOString(),
      error: '提取超时，请重试',
    }, requestId), {
      status: 200, headers: { 'x-request-id': requestId },
    });
  }

  // Build response based on current status
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


/**
 * 检查 DashScope ASR 任务状态（单次查询，不轮询）
 */
async function checkAsrTaskStatus(taskId: string): Promise<{
  status: 'processing' | 'completed' | 'failed';
  text?: string;
  durationSeconds?: number;
  language?: string;
  error?: string;
}> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY not configured');

  const res = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`ASR task query failed: ${res.status}`);
  }

  const json = (await res.json()) as {
    output?: {
      task_id: string;
      task_status: 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'RUNNING';
      results?: Array<{
        transcription_url?: string;
        subtask_status: string;
        code?: string;
        message?: string;
      }>;
    };
  };

  const taskStatus = json.output?.task_status;

  if (taskStatus === 'SUCCEEDED') {
    const results = json.output?.results;
    if (!results?.length) {
      return { status: 'failed', error: 'ASR 返回空结果' };
    }

    const subtask = results[0];
    if (subtask.subtask_status === 'FAILED') {
      return { status: 'failed', error: subtask.message ?? subtask.code ?? 'ASR 子任务失败' };
    }

    if (!subtask.transcription_url) {
      return { status: 'failed', error: 'ASR 无转写结果 URL' };
    }

    // 下载转写结果
    const transRes = await fetch(subtask.transcription_url);
    if (!transRes.ok) {
      return { status: 'failed', error: `下载转写结果失败: ${transRes.status}` };
    }

    const transJson = (await transRes.json()) as {
      transcripts?: Array<{
        text: string;
        content_duration_in_milliseconds?: number;
      }>;
    };

    const text = transJson.transcripts
      ?.map((t) => t.text)
      .filter(Boolean)
      .join('\n') ?? '';

    if (!text) {
      return { status: 'failed', error: 'ASR 转写结果为空' };
    }

    const durationMs = transJson.transcripts?.[0]?.content_duration_in_milliseconds;
    const durationSeconds = durationMs ? Math.ceil(durationMs / 1000) : undefined;

    return { status: 'completed', text, durationSeconds, language: 'zh' };
  }

  if (taskStatus === 'FAILED') {
    const failMsg = json.output?.results?.[0]?.message ?? json.output?.results?.[0]?.code ?? '未知错误';
    return { status: 'failed', error: `ASR 失败: ${failMsg}` };
  }

  // PENDING or RUNNING
  return { status: 'processing' };
}
