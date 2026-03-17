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
    // 获取视频信息（含字幕列表）
    const params = bvid ? `bvid=${bvid}` : `aid=${aid}`;
    const infoRes = await fetch(
      `https://api.bilibili.com/x/player/v2?${params}&cid=0`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://www.bilibili.com',
        },
      },
    );

    if (!infoRes.ok) {
      logger.warn('bilibili-subtitle: player API failed', { status: infoRes.status });
      return null;
    }

    const infoJson = (await infoRes.json()) as { code: number; data?: BiliPlayerInfo };
    if (infoJson.code !== 0 || !infoJson.data?.subtitle?.subtitles?.length) {
      // 需要先获取 cid
      const cidRes = await fetch(
        `https://api.bilibili.com/x/web-interface/view?${params}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: 'https://www.bilibili.com',
          },
        },
      );
      if (!cidRes.ok) return null;

      const cidJson = (await cidRes.json()) as { code: number; data?: { cid?: number } };
      if (cidJson.code !== 0 || !cidJson.data?.cid) return null;

      const cid = cidJson.data.cid;
      const retryRes = await fetch(
        `https://api.bilibili.com/x/player/v2?${params}&cid=${cid}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: 'https://www.bilibili.com',
          },
        },
      );
      if (!retryRes.ok) return null;

      const retryJson = (await retryRes.json()) as { code: number; data?: BiliPlayerInfo };
      if (retryJson.code !== 0 || !retryJson.data?.subtitle?.subtitles?.length) {
        logger.info('bilibili-subtitle: no subtitles available', { videoUrl });
        return null;
      }

      return await fetchSubtitleContent(retryJson.data.subtitle.subtitles);
    }

    return await fetchSubtitleContent(infoJson.data.subtitle.subtitles);
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
