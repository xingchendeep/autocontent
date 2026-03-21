/**
 * 视频脚本提取 - 混合方案入口
 *
 * 策略：
 * 1. B站 → 先尝试字幕 API（免费），失败则 fallback 到 ASR
 * 2. 其他平台 → 直接走 ASR
 *
 * 限制：
 * - 免费用户每天 3 次
 * - 视频最长 30 分钟
 */

export { detectPlatform } from './platform-detect';
export { extractBilibiliSubtitle } from './bilibili-subtitle';
export { transcribeAudio, submitTranscriptionTask, pollTranscriptionResult } from './asr-service';
export type { ExtractionResult, ExtractionJob, SupportedVideoPlatform, ExtractionMethod } from './types';

import { logger } from '@/lib/logger';
import { detectPlatform } from './platform-detect';
import { extractBilibiliSubtitle } from './bilibili-subtitle';
import { transcribeAudio } from './asr-service';
import type { ExtractionResult } from './types';

/** 最大视频时长（秒） */
const MAX_DURATION_SECONDS = 30 * 60; // 30 分钟

/**
 * 从视频 URL 提取脚本文本
 * @param videoUrl 视频页面 URL
 * @param audioUrl 可选的音频/视频直链（如果已经解析好了）
 * @param awemeId 可选的抖音视频 ID（用于 "have no audio" 重试）
 */
export async function extractVideoScript(
  videoUrl: string,
  audioUrl?: string,
  awemeId?: string,
): Promise<ExtractionResult> {
  const platform = detectPlatform(videoUrl);
  logger.info('extract: starting extraction', { videoUrl, platform, awemeId });

  // B站优先走字幕 API
  if (platform === 'bilibili') {
    const subtitleResult = await extractBilibiliSubtitle(videoUrl);
    if (subtitleResult) {
      if (subtitleResult.durationSeconds && subtitleResult.durationSeconds > MAX_DURATION_SECONDS) {
        throw new Error(`视频时长超过 ${MAX_DURATION_SECONDS / 60} 分钟限制`);
      }
      logger.info('extract: bilibili subtitle API succeeded', { videoUrl });
      return subtitleResult;
    }
    logger.info('extract: bilibili subtitle API failed, falling back to ASR', { videoUrl });
  }

  // ASR — 如果没有 audioUrl，尝试服务端自动解析视频直链
  if (!audioUrl) {
    logger.info('extract: no audioUrl provided, trying server-side video URL resolution', { platform });
    const resolvedUrl = await resolveVideoUrl(videoUrl, platform, awemeId);
    if (resolvedUrl) {
      audioUrl = resolvedUrl;
      logger.info('extract: resolved video URL server-side', { audioUrl: audioUrl.slice(0, 100) });
    } else {
      // 针对不同平台给出更具体的错误提示
      if (platform === 'bilibili') {
        throw new Error(
          '无法获取B站视频音频流（可能需要登录或视频有访问限制）。请尝试使用浏览器扩展提取。',
        );
      }
      throw new Error(
        '无法自动获取视频地址。请尝试使用浏览器扩展提取，或换一个视频链接。',
      );
    }
  }

  logger.info('extract: starting ASR transcription', { videoUrl, audioUrl: audioUrl.slice(0, 100) });

  const { proxyDownloadVideo, cleanupTempFile } = await import('./video-proxy');

  // 第一次尝试：用客户端提供的 URL
  const firstResult = await tryAsrWithProxy(audioUrl, platform, proxyDownloadVideo, cleanupTempFile);
  if (firstResult.ok) {
    if (firstResult.result.durationSeconds && firstResult.result.durationSeconds > MAX_DURATION_SECONDS) {
      throw new Error(`视频时长超过 ${MAX_DURATION_SECONDS / 60} 分钟限制`);
    }
    return firstResult.result;
  }

  // 第一次失败了，检查是否是 "have no audio" 错误
  const isNoAudio = firstResult.error.includes('have no audio');

  // 如果是 "have no audio" 且有 awemeId，尝试通过移动端分享页获取合并视频
  // 抖音、头条、西瓜都是字节系，共享同一套重试逻辑
  if (isNoAudio && awemeId && (platform === 'douyin' || platform === 'toutiao' || platform === 'ixigua')) {
    logger.info('extract: "have no audio" detected, trying fallback', { awemeId, platform });

    const fallbackUrl = platform === 'douyin'
      ? await fetchDouyinVideoUrl(awemeId)
      : await fetchToutiaoVideoUrl(awemeId);

    if (fallbackUrl && fallbackUrl !== audioUrl) {
      logger.info('extract: got fallback URL', { platform, fallbackUrl: fallbackUrl.slice(0, 100) });

      const secondResult = await tryAsrWithProxy(fallbackUrl, platform, proxyDownloadVideo, cleanupTempFile);
      if (secondResult.ok) {
        if (secondResult.result.durationSeconds && secondResult.result.durationSeconds > MAX_DURATION_SECONDS) {
          throw new Error(`视频时长超过 ${MAX_DURATION_SECONDS / 60} 分钟限制`);
        }
        return secondResult.result;
      }
      // 第二次也失败了
      throw new Error(`语音识别失败（已尝试备用地址）：${secondResult.error}`);
    }
  }

  // 没有 fallback 可用，抛出原始错误
  const msg = firstResult.error;
  if (msg.includes('FORBIDDEN') || msg.includes('DownloadFailed') || msg.includes('download')) {
    throw new Error(`视频文件无法被语音识别服务访问。原始错误：${msg}`);
  }
  throw new Error(msg);
}

/**
 * 服务端自动解析视频直链
 * 当网站端只传了页面 URL 没有 audioUrl 时，尝试从页面解析出视频直链
 */
async function resolveVideoUrl(
  pageUrl: string,
  platform: string,
  awemeId?: string,
): Promise<string | null> {
  // 抖音：从 URL 提取 awemeId，然后用移动端分享页获取视频地址
  if (platform === 'douyin') {
    const id = awemeId
      ?? pageUrl.match(/\/video\/(\d+)/)?.[1]
      ?? pageUrl.match(/modal_id=(\d+)/)?.[1];
    if (id) {
      const url = await fetchDouyinVideoUrl(id);
      if (url) return url;
    }
  }

  // B站：尝试获取视频直链（用于 ASR fallback）
  if (platform === 'bilibili') {
    return await resolveBilibiliVideoUrl(pageUrl);
  }

  // 快手：尝试从页面获取视频地址
  if (platform === 'kuaishou') {
    return await resolveKuaishouVideoUrl(pageUrl);
  }

  return null;
}

/** B站：服务端获取视频音频流用于 ASR */
async function resolveBilibiliVideoUrl(pageUrl: string): Promise<string | null> {
  try {
    const bvMatch = pageUrl.match(/\/video\/(BV[\w]+)/i);
    const bvid = bvMatch?.[1];
    if (!bvid) return null;

    // 获取 cid
    const viewRes = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://www.bilibili.com',
        },
      },
    );
    if (!viewRes.ok) {
      logger.warn('extract: bilibili view API HTTP error', { status: viewRes.status });
      return null;
    }
    const viewJson = (await viewRes.json()) as { code: number; data?: { cid?: number } };
    if (viewJson.code !== 0 || !viewJson.data?.cid) {
      logger.warn('extract: bilibili view API returned no cid', { code: viewJson.code });
      return null;
    }
    const cid = viewJson.data.cid;

    // 获取视频流地址（fnval=16 请求 DASH 格式，包含独立音频流）
    // 注意：无 cookie 时 B站可能返回 -403（权限不足），这是正常的
    const playRes = await fetch(
      `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=16`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://www.bilibili.com',
        },
      },
    );
    if (!playRes.ok) {
      logger.warn('extract: bilibili playurl API HTTP error', { status: playRes.status });
      return null;
    }
    const playJson = (await playRes.json()) as {
      code: number;
      message?: string;
      data?: {
        dash?: { audio?: Array<{ baseUrl: string; backup_url?: string[] }> };
        durl?: Array<{ url: string; backup_url?: string[] }>;
      };
    };

    if (playJson.code !== 0 || !playJson.data) {
      logger.warn('extract: bilibili playurl API error', {
        code: playJson.code,
        message: playJson.message,
        bvid,
      });
      // code=-403 表示需要登录，无法获取视频流
      return null;
    }

    // 优先用 DASH 音频流（纯音频，体积小，ASR 效果好）
    const dashAudioTrack = playJson.data.dash?.audio?.[0];
    if (dashAudioTrack?.baseUrl) {
      logger.info('extract: resolved bilibili DASH audio', { url: dashAudioTrack.baseUrl.slice(0, 100) });
      return dashAudioTrack.baseUrl;
    }

    // fallback: durl（合并流）
    const durlTrack = playJson.data.durl?.[0];
    if (durlTrack?.url) {
      logger.info('extract: resolved bilibili durl', { url: durlTrack.url.slice(0, 100) });
      return durlTrack.url;
    }

    logger.warn('extract: bilibili playurl returned no audio/video URLs', { bvid });
    return null;
  } catch (err) {
    logger.warn('extract: resolveBilibiliVideoUrl failed', { error: String(err) });
    return null;
  }
}

/** 快手：从页面获取视频地址 */
async function resolveKuaishouVideoUrl(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;

    const html = await res.text();
    const patterns = [
      /"playUrl"\s*:\s*"(https?:[^"]+)"/,
      /"photoUrl"\s*:\s*"(https?:[^"]+)"/,
      /"srcNoMark"\s*:\s*"(https?:[^"]+)"/,
      /https?:\/\/[^"'\s\\]+?(?:txvideo|ksyun|kuaishou|ksc\.com|kwaicdn|photocdn)[^"'\s\\]*/i,
    ];

    for (const pat of patterns) {
      const match = html.match(pat);
      if (match?.[1]) {
        const url = match[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
        if (url.startsWith('http')) {
          logger.info('extract: resolved kuaishou video URL', { url: url.slice(0, 100) });
          return url;
        }
      }
    }
    return null;
  } catch (err) {
    logger.warn('extract: resolveKuaishouVideoUrl failed', { error: String(err) });
    return null;
  }
}

/** 尝试代理下载 + ASR，返回结果或错误 */
async function tryAsrWithProxy(
  mediaUrl: string,
  platform: string,
  proxyDownloadVideo: typeof import('./video-proxy').proxyDownloadVideo,
  cleanupTempFile: typeof import('./video-proxy').cleanupTempFile,
): Promise<{ ok: true; result: ExtractionResult } | { ok: false; error: string }> {
  let fileId: string | undefined;
  try {
    const proxy = await proxyDownloadVideo(mediaUrl, platform);
    fileId = proxy.fileId;
    logger.info('extract: video proxied', { fileId, size: proxy.size });

    const result = await transcribeAudio(proxy.publicUrl, {
      isOssPrefix: proxy.isOssPrefix,
    });
    return { ok: true, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('extract: ASR attempt failed', { mediaUrl: mediaUrl.slice(0, 100), error: msg });
    return { ok: false, error: msg };
  } finally {
    if (fileId) {
      cleanupTempFile(fileId).catch(() => {});
    }
  }
}

/**
 * 通过抖音 Web API 获取视频的无水印播放地址
 * 这个地址通常是音视频合并的 MP4
 */
async function fetchDouyinVideoUrl(awemeId: string): Promise<string | null> {
  try {
    // 方法 1：通过抖音移动端分享页获取重定向后的视频地址
    const shareUrl = `https://www.iesdouyin.com/share/video/${awemeId}/`;
    const res = await fetch(shareUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      logger.warn('extract: douyin share page failed', { status: res.status });
      return null;
    }

    const html = await res.text();

    // 从分享页 HTML 中提取视频 URL
    // 分享页通常包含 playAddr 或 video_url 在 script 标签中
    const patterns = [
      // SSR 数据中的 playAddr
      /"playAddr"\s*:\s*"(https?:[^"]+)"/,
      /"play_addr"\s*:\s*\{[^}]*"url_list"\s*:\s*\["(https?:[^"]+)"/,
      // 直接的视频 URL
      /https?:\/\/[^"'\s]+?(?:douyinvod|v\d+-[a-z]+)[^"'\s]*?(?:video_id|aweme_id)[^"'\s]*/i,
    ];

    for (const pat of patterns) {
      const match = html.match(pat);
      if (match?.[1]) {
        const url = match[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
        if (url.startsWith('http')) {
          logger.info('extract: found video URL from douyin share page', { url: url.slice(0, 100) });
          return url;
        }
      }
    }

    // 方法 2：尝试从 HTML 中提取所有 douyinvod URL
    const vodPat = /https?:\/\/[^"'\s\\]+?(?:douyinvod|v\d+-[a-z]+\.douyinvod)[^"'\s\\]*/gi;
    const vodMatches = html.match(vodPat);
    if (vodMatches && vodMatches.length > 0) {
      const url = vodMatches[0].replace(/\\u002F/g, '/').replace(/\\/g, '');
      logger.info('extract: found vod URL from douyin share page', { url: url.slice(0, 100) });
      return url;
    }

    logger.warn('extract: no video URL found in douyin share page');
    return null;
  } catch (err) {
    logger.warn('extract: fetchDouyinVideoUrl failed', { error: String(err) });
    return null;
  }
}

/**
 * 通过头条/西瓜移动端页面获取视频的播放地址
 * 头条和西瓜都是字节系，移动端页面通常包含音视频合并的 MP4
 */
async function fetchToutiaoVideoUrl(videoId: string): Promise<string | null> {
  try {
    // 头条移动端文章/视频页
    const mobileUrl = `https://m.toutiao.com/i${videoId}/`;
    const res = await fetch(mobileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      logger.warn('extract: toutiao mobile page failed', { status: res.status });
      return null;
    }

    const html = await res.text();

    // 从移动端页面提取视频 URL
    // 头条移动端页面通常在 script 中包含视频数据
    const patterns = [
      // videoPlayUrl / playUrl
      /"(?:videoPlayUrl|playUrl|video_url|play_addr_lowbr|main_url)"\s*:\s*"(https?:[^"]+)"/,
      // base64 编码的视频地址
      /"(?:main_url|video_url|backup_url_1|url)"\s*:\s*"([A-Za-z0-9+/=]{20,})"/,
      // 字节系 CDN URL
      /https?:\/\/[^"'\s\\]+?(?:toutiaovod|pstatp|douyinvod|bytevcloudcdn|bytecdn|v\d+-tt)[^"'\s\\]*/i,
    ];

    for (const pat of patterns) {
      const match = html.match(pat);
      if (match?.[1]) {
        let url = match[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
        // 尝试 base64 解码
        if (!url.startsWith('http')) {
          try {
            const decoded = Buffer.from(url, 'base64').toString('utf-8');
            if (decoded.startsWith('http')) url = decoded;
            else continue;
          } catch {
            continue;
          }
        }
        if (url.startsWith('http')) {
          logger.info('extract: found video URL from toutiao mobile page', { url: url.slice(0, 100) });
          return url;
        }
      }
    }

    // 兜底：提取所有字节系 CDN URL
    const vodPat = /https?:\/\/[^"'\s\\]+?(?:toutiaovod|pstatp|douyinvod|bytevcloudcdn|v\d+-tt)[^"'\s\\]*/gi;
    const vodMatches = html.match(vodPat);
    if (vodMatches && vodMatches.length > 0) {
      const url = vodMatches[0].replace(/\\u002F/g, '/').replace(/\\/g, '');
      logger.info('extract: found vod URL from toutiao mobile page', { url: url.slice(0, 100) });
      return url;
    }

    // 再试西瓜视频移动端（头条视频有时也在西瓜上）
    const ixiguaUrl = `https://m.ixigua.com/video/${videoId}/`;
    const ixRes = await fetch(ixiguaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      },
      redirect: 'follow',
    });

    if (ixRes.ok) {
      const ixHtml = await ixRes.text();
      const ixVodMatches = ixHtml.match(vodPat);
      if (ixVodMatches && ixVodMatches.length > 0) {
        const url = ixVodMatches[0].replace(/\\u002F/g, '/').replace(/\\/g, '');
        logger.info('extract: found vod URL from ixigua mobile page', { url: url.slice(0, 100) });
        return url;
      }
    }

    logger.warn('extract: no video URL found in toutiao/ixigua mobile pages');
    return null;
  } catch (err) {
    logger.warn('extract: fetchToutiaoVideoUrl failed', { error: String(err) });
    return null;
  }
}

