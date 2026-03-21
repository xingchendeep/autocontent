import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

interface ProcessPayload {
  jobId: string;
  videoUrl: string;
  audioUrl?: string | null;
  platform: string;
  awemeId?: string | null;
  storagePath?: string;
}

/**
 * POST /api/extract/process
 * 异步处理提取任务：
 * - B站字幕提取：同步完成
 * - ASR：解析视频 URL → 代理下载 → 上传 DashScope OSS → 提交 ASR 任务 → 保存 task_id
 *   ASR 结果轮询由 GET /api/extract/[id] 在前端 poll 时逐步检查
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const signingKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const upstashSignature = req.headers.get('upstash-signature');

  if (!upstashSignature && signingKey) {
    logger.warn('extract/process: missing QStash signature');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: ProcessPayload;
  try {
    payload = await req.json() as ProcessPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { jobId, videoUrl, audioUrl, platform, awemeId, storagePath } = payload;
  if (!jobId || !videoUrl) {
    return NextResponse.json({ error: 'Missing jobId or videoUrl' }, { status: 400 });
  }

  const db = createServiceRoleClient();

  const { data: job } = await db
    .from('extraction_jobs')
    .select('status')
    .eq('id', jobId)
    .maybeSingle();

  if (!job || (job as { status: string }).status === 'completed') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await db.from('extraction_jobs').update({ status: 'processing' }).eq('id', jobId);

  try {
    // Upload 类型：直接提交 ASR（video_url 已经是 Supabase Storage 直链）
    if (platform === 'upload') {
      const { submitTranscriptionTask } = await import('@/lib/extract/asr-service');
      const taskId = await submitTranscriptionTask(videoUrl);
      await db.from('extraction_jobs').update({ asr_task_id: taskId }).eq('id', jobId);
      logger.info('extract/process: upload ASR submitted', { jobId, taskId });
      return NextResponse.json({ ok: true });
    }

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
        logger.info('extract/process: bilibili subtitle done', { jobId });
        return NextResponse.json({ ok: true });
      }
      logger.info('extract/process: bilibili no subtitle, fallback ASR', { jobId });
    }

    // ASR 流程：解析视频直链 → 代理下载 → 上传 OSS → 提交 ASR（不轮询）
    let mediaUrl = audioUrl ?? undefined;

    if (!mediaUrl) {
      const { resolveVideoUrl } = await import('@/lib/extract');
      const resolvedAwemeId = awemeId
        ?? videoUrl.match(/\/video\/(\d+)/)?.[1]
        ?? videoUrl.match(/modal_id=(\d+)/)?.[1]
        ?? undefined;
      mediaUrl = (await resolveVideoUrl(videoUrl, platform, resolvedAwemeId)) ?? undefined;
    }

    if (!mediaUrl) {
      throw new Error('无法自动获取视频地址。请尝试使用浏览器扩展提取，或换一个视频链接。');
    }

    const { proxyDownloadVideo, cleanupTempFile } = await import('@/lib/extract/video-proxy');
    const proxy = await proxyDownloadVideo(mediaUrl, platform);
    logger.info('extract/process: proxied', { jobId, size: proxy.size });

    const { submitTranscriptionTask } = await import('@/lib/extract/asr-service');
    const taskId = await submitTranscriptionTask(proxy.publicUrl, { isOssPrefix: proxy.isOssPrefix });

    await db.from('extraction_jobs').update({ asr_task_id: taskId }).eq('id', jobId);
    logger.info('extract/process: ASR submitted', { jobId, taskId, platform });

    cleanupTempFile(proxy.fileId).catch(() => {});
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.from('extraction_jobs').update({
      status: 'failed',
      error_message: errorMessage,
    }).eq('id', jobId);
    logger.error('extract/process: failed', { jobId, platform, error: errorMessage });
  } finally {
    if (platform === 'upload' && storagePath) {
      await db.storage.from('temp-videos').remove([storagePath]).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
