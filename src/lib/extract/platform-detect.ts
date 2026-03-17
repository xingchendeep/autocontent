import type { SupportedVideoPlatform } from './types';

/** 从 URL 识别视频平台 */
export function detectPlatform(url: string): SupportedVideoPlatform {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('bilibili.com') || host.includes('b23.tv')) return 'bilibili';
    if (host.includes('douyin.com')) return 'douyin';
    if (host.includes('xiaohongshu.com') || host.includes('xhslink.com')) return 'xiaohongshu';
    if (host.includes('weibo.com') || host.includes('weibo.cn')) return 'weibo';
    if (host.includes('kuaishou.com') || host.includes('gifshow.com')) return 'kuaishou';
    if (host.includes('zhihu.com')) return 'zhihu';
    if (host.includes('toutiao.com')) return 'toutiao';
    if (host.includes('mp.weixin.qq.com')) return 'wechat';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
    if (host.includes('linkedin.com')) return 'linkedin';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
