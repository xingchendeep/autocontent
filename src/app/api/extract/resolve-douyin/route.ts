import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { verifyApiKey } from '@/lib/api-keys';
import { generateRequestId, createSuccess, createError, ERROR_CODES, ERROR_STATUS } from '@/lib/errors';
import { logger } from '@/lib/logger';

const schema = z.object({
  videoUrl: z.string().url(),
});

/**
 * POST /api/extract/resolve-douyin
 * 服务端解析抖音短链/分享链，提取 awemeId
 * 支持：v.douyin.com 短链、分享口令跳转链、www.douyin.com 标准链接
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

  const { videoUrl } = parsed.data;

  try {
    const awemeId = await resolveDouyinAwemeId(videoUrl);
    if (!awemeId) {
      return NextResponse.json(
        createError(ERROR_CODES.NOT_FOUND, '无法从该链接解析出抖音视频 ID', requestId),
        { status: ERROR_STATUS.NOT_FOUND },
      );
    }
    return NextResponse.json(createSuccess({ awemeId }, requestId));
  } catch (err) {
    logger.error('resolve-douyin: failed', { videoUrl, error: String(err) });
    return NextResponse.json(
      createError(ERROR_CODES.INTERNAL_ERROR, '解析抖音链接失败', requestId),
      { status: ERROR_STATUS.INTERNAL_ERROR },
    );
  }
}

/**
 * 从抖音 URL（包括短链）解析出 awemeId
 * 1. 先尝试直接从 URL 正则提取
 * 2. 如果是短链（v.douyin.com），跟随重定向拿到最终 URL 再提取
 */
async function resolveDouyinAwemeId(videoUrl: string): Promise<string | null> {
  // 直接从 URL 提取
  const directId = extractAwemeIdFromUrl(videoUrl);
  if (directId) return directId;

  // 短链/分享链：跟随重定向
  try {
    const res = await fetch(videoUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      },
      redirect: 'follow',
    });

    // 从最终 URL 提取
    const finalUrl = res.url;
    const idFromRedirect = extractAwemeIdFromUrl(finalUrl);
    if (idFromRedirect) return idFromRedirect;

    // 从 HTML 中提取（某些情况下 URL 里没有，但 HTML 里有）
    const html = await res.text();
    const htmlPatterns = [
      /aweme_id[=:][\s"']*(\d{15,})/,
      /\/video\/(\d{15,})/,
      /modal_id=(\d{15,})/,
      /"awemeId"\s*:\s*"(\d{15,})"/,
      /"id"\s*:\s*"(\d{15,})"/,
    ];
    for (const pat of htmlPatterns) {
      const match = html.match(pat);
      if (match?.[1]) return match[1];
    }

    return null;
  } catch (err) {
    logger.warn('resolve-douyin: redirect follow failed', { videoUrl, error: String(err) });
    return null;
  }
}

function extractAwemeIdFromUrl(url: string): string | null {
  const patterns = [
    /\/video\/(\d{15,})/,
    /modal_id=(\d{15,})/,
    /aweme_id=(\d{15,})/,
    /item_id=(\d{15,})/,
  ];
  for (const pat of patterns) {
    const match = url.match(pat);
    if (match?.[1]) return match[1];
  }
  return null;
}
