import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { verifyApiKey } from '@/lib/api-keys';
import { generateRequestId, createSuccess, createError, ERROR_CODES, ERROR_STATUS } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const maxDuration = 30;

const schema = z.object({
  videoUrl: z.string().url(),
});

/**
 * POST /api/extract/resolve-douyin
 * 服务端解析抖音短链/分享链，提取 awemeId + 视频 CDN URL
 * 返回 { awemeId, videoDirectUrl? }
 * videoDirectUrl 是 DashScope 可直接访问的 CDN URL（douyinvod.com）
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
    const result = await resolveDouyinFull(videoUrl);
    if (!result.awemeId) {
      return NextResponse.json(
        createError(ERROR_CODES.NOT_FOUND, '无法从该链接解析出抖音视频 ID', requestId),
        { status: ERROR_STATUS.NOT_FOUND },
      );
    }
    return NextResponse.json(createSuccess({
      awemeId: result.awemeId,
      videoDirectUrl: result.videoDirectUrl ?? null,
    }, requestId));
  } catch (err) {
    logger.error('resolve-douyin: failed', { videoUrl, error: String(err) });
    return NextResponse.json(
      createError(ERROR_CODES.INTERNAL_ERROR, '解析抖音链接失败', requestId),
      { status: ERROR_STATUS.INTERNAL_ERROR },
    );
  }
}

/**
 * 完整解析抖音链接：awemeId + 视频 CDN URL
 * 1. 从 URL 正则提取 awemeId
 * 2. 如果是短链，跟随重定向拿到最终 URL
 * 3. 用 awemeId 获取视频 CDN URL（分享页 HTML 解析 + 重定向跟随）
 */
async function resolveDouyinFull(videoUrl: string): Promise<{
  awemeId: string | null;
  videoDirectUrl: string | null;
}> {
  // Step 1: 提取 awemeId
  let awemeId = extractAwemeIdFromUrl(videoUrl);

  if (!awemeId) {
    // 短链/分享链：跟随重定向
    try {
      const res = await fetch(videoUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      const finalUrl = res.url;
      awemeId = extractAwemeIdFromUrl(finalUrl);

      if (!awemeId) {
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
          if (match?.[1]) { awemeId = match[1]; break; }
        }
      }
    } catch (err) {
      logger.warn('resolve-douyin: redirect follow failed', { videoUrl, error: String(err) });
    }
  }

  if (!awemeId) {
    return { awemeId: null, videoDirectUrl: null };
  }

  // Step 2: 获取视频 CDN URL（带超时，不阻塞）
  let videoDirectUrl: string | null = null;
  try {
    videoDirectUrl = await fetchDouyinCdnUrl(awemeId);
  } catch (err) {
    logger.warn('resolve-douyin: CDN URL fetch failed, returning awemeId only', { awemeId, error: String(err) });
  }

  return { awemeId, videoDirectUrl };
}

/**
 * 获取抖音视频的 CDN 直链（douyinvod.com）
 * 方法：分享页 HTML → 提取 play_addr → HEAD 跟随重定向 → CDN URL
 * 带 15 秒超时
 */
async function fetchDouyinCdnUrl(awemeId: string): Promise<string | null> {
  // 方法 1: iteminfo API
  try {
    const apiUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${awemeId}`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        Referer: 'https://www.iesdouyin.com/',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const json = (await res.json()) as {
        item_list?: Array<{
          video?: {
            play_addr?: { url_list?: string[] };
            download_addr?: { url_list?: string[] };
          };
        }>;
      };

      const video = json.item_list?.[0]?.video;
      const urlList = video?.download_addr?.url_list ?? video?.play_addr?.url_list;
      if (urlList?.length) {
        const playUrl = urlList[0].replace(/\/playwm\//, '/play/');
        return await followRedirect(playUrl);
      }
    }
  } catch (err) {
    logger.info('resolve-douyin: iteminfo API failed', { error: String(err) });
  }

  // 方法 2: 分享页 HTML
  try {
    const shareUrl = `https://www.iesdouyin.com/share/video/${awemeId}/`;
    const res = await fetch(shareUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    const patterns = [
      /"playAddr"\s*:\s*"(https?:[^"]+)"/,
      /"play_addr"\s*:\s*\{[^}]*"url_list"\s*:\s*\["(https?:[^"]+)"/,
      /"download_addr"\s*:\s*\{[^}]*"url_list"\s*:\s*\["(https?:[^"]+)"/,
    ];

    for (const pat of patterns) {
      const match = html.match(pat);
      if (match?.[1]) {
        const playUrl = match[1].replace(/\\u002F/g, '/').replace(/\\/g, '').replace(/\/playwm\//, '/play/');
        if (playUrl.startsWith('http')) {
          return await followRedirect(playUrl);
        }
      }
    }

    // 兜底：CDN URL
    const vodPat = /https?:\/\/[^"'\s\\]+?(?:douyinvod|bytevcloudcdn)[^"'\s\\]*/gi;
    const vodMatches = html.match(vodPat);
    if (vodMatches?.length) {
      const url = vodMatches[0].replace(/\\u002F/g, '/').replace(/\\/g, '');
      return url;
    }
  } catch (err) {
    logger.info('resolve-douyin: share page failed', { error: String(err) });
  }

  return null;
}

/** HEAD 跟随重定向获取最终 CDN URL */
async function followRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        Referer: 'https://www.douyin.com/',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    return res.url || url;
  } catch {
    return url;
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
