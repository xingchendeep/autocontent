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

  // ASR
  if (!audioUrl) {
    throw new Error(
      '当前平台暂不支持自动提取音频，请提供音频直链或使用 B站视频（支持字幕提取）',
    );
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

  // 如果是 "have no audio" 且有 awemeId，尝试通过抖音 API 获取合并视频
  if (isNoAudio && awemeId && platform === 'douyin') {
    logger.info('extract: "have no audio" detected, trying douyin API fallback', { awemeId });

    const fallbackUrl = await fetchDouyinVideoUrl(awemeId);
    if (fallbackUrl && fallbackUrl !== audioUrl) {
      logger.info('extract: got fallback URL from douyin API', { fallbackUrl: fallbackUrl.slice(0, 100) });

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
