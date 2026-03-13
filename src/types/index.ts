// Shared TypeScript types for AutoContent Pro MVP

export type PlatformCode =
  | 'douyin'
  | 'xiaohongshu'
  | 'bilibili'
  | 'weibo'
  | 'wechat'
  | 'twitter'
  | 'linkedin'
  | 'kuaishou'
  | 'zhihu'
  | 'toutiao';

// --- API response envelope ---

export interface ApiSuccess<T> {
  success: true;
  data: T;
  requestId: string; // "req_" + random identifier
  timestamp: string; // ISO 8601
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
  timestamp: string;
}

// --- AI generation types ---

export interface GeneratePlatformInput {
  content: string;
  platform: PlatformCode;
  tone?: 'professional' | 'casual' | 'humorous';
  length?: 'short' | 'medium' | 'long';
}

export interface GeneratePlatformOutput {
  title?: string;
  content: string;
  hashtags?: string[];
  tokensInput: number;
  tokensOutput: number;
  model: string;
}

export interface GenerateResponse {
  generationId: string;
  results: Partial<Record<PlatformCode, GeneratePlatformOutput>>;
  errors: Partial<Record<PlatformCode, string>>;
  durationMs: number;
  model: string;
  partialFailure: boolean;
}

// --- Local history ---

export interface HistoryRecord {
  id: string;
  platforms: PlatformCode[];
  inputSnippet: string; // first 100 chars of input
  createdAt: string;    // ISO 8601
  results: Partial<Record<PlatformCode, GeneratePlatformOutput>>;
}
