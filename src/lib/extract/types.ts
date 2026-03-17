/** 视频脚本提取相关类型 */

export type ExtractionMethod = 'subtitle_api' | 'asr';

export interface ExtractionResult {
  text: string;
  method: ExtractionMethod;
  durationSeconds?: number;
  language?: string;
}

export interface ExtractionJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl: string;
  platform: string;
  result?: ExtractionResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type SupportedVideoPlatform =
  | 'bilibili'
  | 'douyin'
  | 'ixigua'
  | 'xiaohongshu'
  | 'weibo'
  | 'kuaishou'
  | 'zhihu'
  | 'toutiao'
  | 'wechat'
  | 'twitter'
  | 'linkedin'
  | 'unknown';
