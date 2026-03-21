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
  // Upload-specific fields
  storagePath?: string;
}

/**
 * POST /api/extract/process
 * Called by QStash to process extraction jobs asynchronously.
 * Verifies QStash signature for security.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Verify QStash signature
  const signingKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const upstashSignature = req.headers.get('upstash-signature');

  if (!upstashSignature && signingKey) {
    logger.warn('extract/process: missing QStash signature');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse payload
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

  // Check job still exists and is pending
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
    let result: { text: string; method: string; durationSeconds?: number; language?: string };

    if (platform === 'upload') {
      // Upload: video_url is Supabase Storage publicUrl (海外)
      // DashScope ASR 在阿里云中国区，直接访问海外 URL 可能失败
      // 需要先代理下载到 DashScope OSS 再提交 ASR
      const { proxyDownloadVideo, cleanupTempFile } = await import('@/lib/extract/video-proxy');
      let proxyFileId: string | undefined;
      try {
        const proxy = await proxyDownloadVideo(videoUrl, 'upload');
        proxyFileId = proxy.fileId;
        const { transcribeAudio } = await import('@/lib/extract/asr-service');
        result = await transcribeAudio(proxy.publicUrl, { isOssPrefix: proxy.isOssPrefix });
      } finally {
        if (proxyFileId) cleanupTempFile(proxyFileId).catch(() => {});
      }
    } else {
      const { extractVideoScript } = await import('@/lib/extract');
      // Use awemeId from payload (browser extension) or extract from URL
      let resolvedAwemeId: string | undefined = awemeId ?? undefined;
      if (!resolvedAwemeId && platform === 'douyin') {
        const videoMatch = videoUrl.match(/\/video\/(\d+)/);
        const modalMatch = videoUrl.match(/modal_id=(\d+)/);
        resolvedAwemeId = videoMatch?.[1] ?? modalMatch?.[1] ?? undefined;
      }
      result = await extractVideoScript(videoUrl, audioUrl ?? undefined, resolvedAwemeId);
    }

    await db.from('extraction_jobs').update({
      status: 'completed',
      method: result.method,
      result_text: result.text,
      duration_seconds: result.durationSeconds ?? null,
      language: result.language ?? null,
    }).eq('id', jobId);

    logger.info('extract/process: completed', { jobId, platform, method: result.method });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.from('extraction_jobs').update({
      status: 'failed',
      error_message: errorMessage,
    }).eq('id', jobId);
    logger.error('extract/process: failed', { jobId, platform, error: errorMessage });
  } finally {
    // Clean up uploaded file if applicable
    if (platform === 'upload' && storagePath) {
      await db.storage.from('temp-videos').remove([storagePath]).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
