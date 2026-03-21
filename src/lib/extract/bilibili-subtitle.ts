import { logger } from '@/lib/logger';
import type { ExtractionResult } from './types';

/**
 * B站字幕 API 提取器
 * 通过 B站公开的视频信息接口获取字幕 JSON
 */

/** 从 B站 URL 提取 bvid */
function extractBvid(url: string): string | null {
  // 匹配 /video/BVxxxxxx 格式
  const bvMatch = url.match(/\/video\/(BV[\w]+)/i);
  if (bvMatch) return bvMatch[1];

  // 匹配 b23.tv 短链（需要先跟随重定向，这里只做基本匹配）
  return null;
}

/** 从 B站 URL 提取 aid（av号） */
function extractAid(url: string): string | null {
  const avMatch = url.match(/\/video\/av(\d+)/i);
  return avMatch ? avMatch[1] : null;
}

interface BiliPlayerInfo {
  subtitle?: {
    subtitles?: Array<{
      subtitle_url: string;
      lan: string;
      lan_doc: string;
    }>;
  };
}

interface BiliSubtitleBody {
  body?: Array<{
    from: number;
    to: number;
    content: string;
  }>;
}

export async function extractBilibiliSubtitle(videoUrl: string): Promise<ExtractionResult | null> {
  const bvid = extractBvid(videoUrl);
  const aid = extractAid(videoUrl);

  if (!bvid && !aid) {
    logger.warn('bilibili-subtitle: cannot extract video id from URL', { videoUrl });
    return null;
  }

  try {
    // Step 1: 获取 cid 和 aid（如果只有 bvid）
    const params = bvid ? `bvid=${bvid}` : `aid=${aid}`;
    const viewRes = await fetch(
      `https://api.bilibili.com/x/web-interface/view?${params}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://www.bilibili.com',
        },
      },
    );

    if (!viewRes.ok) {
      logger.warn('bilibili-subtitle: view API failed', { status: viewRes.status });
      return null;
    }

    const viewJson = (await viewRes.json()) as { code: number; data?: { aid?: number; cid?: number } };
    if (viewJson.code !== 0 || !viewJson.data?.cid) {
      logger.warn('bilibili-subtitle: view API returned no cid', { code: viewJson.code });
      return null;
    }

    const resolvedAid = viewJson.data.aid;
    const cid = viewJson.data.cid;

    // Step 2: 用 dm/view 接口获取字幕列表（不需要 cookie，支持 AI 生成字幕）
    const dmRes = await fetch(
      `https://api.bilibili.com/x/v2/dm/view?type=1&oid=${cid}&pid=${resolvedAid}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://www.bilibili.com',
        },
      },
    );

    if (!dmRes.ok) {
      logger.warn('bilibili-subtitle: dm/view API failed', { status: dmRes.status });
      return null;
    }

    const dmJson = (await dmRes.json()) as {
      code: number;
      data?: { subtitle?: { subtitles?: Array<{ subtitle_url: string; lan: string; lan_doc: string }> } };
    };

    if (dmJson.code !== 0 || !dmJson.data?.subtitle?.subtitles?.length) {
      logger.info('bilibili-subtitle: no subtitles available via dm/view', { videoUrl });

      // Fallback: 尝试 player/v2 接口（某些视频可能只在这个接口有字幕）
      const playerRes = await fetch(
        `https://api.bilibili.com/x/player/v2?${params}&cid=${cid}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: 'https://www.bilibili.com',
          },
        },
      );
      if (playerRes.ok) {
        const playerJson = (await playerRes.json()) as { code: number; data?: BiliPlayerInfo };
        if (playerJson.code === 0 && playerJson.data?.subtitle?.subtitles?.length) {
          return await fetchSubtitleContent(playerJson.data.subtitle.subtitles);
        }
      }

      return null;
    }

    return await fetchSubtitleContent(dmJson.data.subtitle.subtitles);
  } catch (err) {
    logger.error('bilibili-subtitle: extraction failed', { videoUrl, error: String(err) });
    return null;
  }
}


async function fetchSubtitleContent(
  subtitles: Array<{ subtitle_url: string; lan: string; lan_doc: string }>,
): Promise<ExtractionResult | null> {
  // 优先中文字幕
  const zhSub = subtitles.find((s) => s.lan.startsWith('zh')) ?? subtitles[0];
  if (!zhSub) return null;

  let subtitleUrl = zhSub.subtitle_url;
  if (subtitleUrl.startsWith('//')) subtitleUrl = 'https:' + subtitleUrl;

  const subRes = await fetch(subtitleUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://www.bilibili.com',
    },
  });
  if (!subRes.ok) return null;

  const subJson = (await subRes.json()) as BiliSubtitleBody;
  if (!subJson.body?.length) return null;

  const items = subJson.body;
  const parts: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const s = items[i].content.trim();
    if (!s) continue;
    if (/[。！？.!?]$/.test(s)) { parts.push(s); continue; }
    if (/[，,；;：:、…—]$/.test(s)) { parts.push(s); continue; }
    if (i === items.length - 1) { parts.push(s + '。'); continue; }
    const gap = items[i + 1].from - items[i].to;
    if (gap >= 0.5) {
      parts.push(s + '。');
    } else {
      parts.push(s + '，');
    }
  }
  const text = parts.join('');
  const lastItem = subJson.body[subJson.body.length - 1];
  const durationSeconds = lastItem ? Math.ceil(lastItem.to) : undefined;

  return {
    text,
    method: 'subtitle_api',
    durationSeconds,
    language: zhSub.lan,
  };
}
