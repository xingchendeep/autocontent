import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { verifyApiKey } from '@/lib/api-keys';
import { generateRequestId, createSuccess, createError, ERROR_CODES, ERROR_STATUS } from '@/lib/errors';
import { extractBilibiliSubtitle } from '@/lib/extract/bilibili-subtitle';

const schema = z.object({
  videoUrl: z.string().url(),
});

/**
 * POST /api/extract/bilibili-subtitle
 * 服务端代理 B站字幕提取（绕过浏览器 CORS 限制）
 * 同步返回字幕文本，无需轮询
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
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
      createError(ERROR_CODES.UNAUTHORIZED, '请先登录', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED },
    );
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '请求体格式错误', requestId),
      { status: ERROR_STATUS.INVALID_INPUT },
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, parsed.error.issues[0]?.message ?? '参数错误', requestId),
      { status: ERROR_STATUS.INVALID_INPUT },
    );
  }

  const result = await extractBilibiliSubtitle(parsed.data.videoUrl);
  if (!result) {
    return NextResponse.json(
      createError(ERROR_CODES.NOT_FOUND, '该视频暂无字幕，请尝试语音识别', requestId),
      { status: ERROR_STATUS.NOT_FOUND },
    );
  }

  return NextResponse.json(createSuccess({ text: result.text, method: result.method }, requestId));
}
