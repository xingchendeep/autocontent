import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
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

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const maxDuration = 60;
const ALLOWED_TYPES = [
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg',
];

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

  // Rate limit: free 3/day, paid unlimited
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

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '请上传文件', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '请选择要上传的文件', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '文件大小不能超过 50MB', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '仅支持 MP4、WebM、MOV 视频和 MP3、WAV、OGG 音频格式', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const db = createServiceRoleClient();
  const fileId = crypto.randomUUID();
  const ext = file.name.split('.').pop() ?? 'mp4';
  const storagePath = `${userId}/${fileId}.${ext}`;

  // Upload to Supabase Storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await db.storage
    .from('temp-videos')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      createError(ERROR_CODES.INTERNAL_ERROR, '文件上传失败，请重试', requestId),
      { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
    );
  }

  // Get public URL for ASR
  const { data: urlData } = db.storage.from('temp-videos').getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;

  // Create extraction job
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

  // Schedule background ASR processing using Next.js after() API
  after(async () => {
    const bgDb = createServiceRoleClient();
    await bgDb.from('extraction_jobs').update({ status: 'processing' }).eq('id', jobId);

    try {
      const { transcribeAudio } = await import('@/lib/extract/asr-service');
      const result = await transcribeAudio(publicUrl);

      await bgDb.from('extraction_jobs').update({
        status: 'completed',
        method: result.method,
        result_text: result.text,
        duration_seconds: result.durationSeconds ?? null,
        language: result.language ?? null,
      }).eq('id', jobId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await bgDb.from('extraction_jobs').update({
        status: 'failed',
        error_message: errorMessage,
      }).eq('id', jobId);
    } finally {
      // Clean up uploaded file
      await bgDb.storage.from('temp-videos').remove([storagePath]).catch(() => {});
    }
  });

  return NextResponse.json(
    createSuccess({ jobId, status: 'pending', platform: 'upload' }, requestId),
    { status: 202, headers: { 'x-request-id': requestId } },
  );
}
