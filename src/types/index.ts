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

// --- Auth types ---

export interface AuthUser {
  id: string;    // UUID from auth.users
  email: string;
}

export interface AuthSession {
  user: AuthUser;
  expiresAt: number; // Unix timestamp
}

// --- Local history ---

export interface HistoryRecord {
  id: string;
  platforms: PlatformCode[];
  inputSnippet: string; // first 100 chars of input
  createdAt: string;    // ISO 8601
  results: Partial<Record<PlatformCode, GeneratePlatformOutput>>;
}

// --- Plan capability ---

export interface PlanCapability {
  planCode: string;
  displayName: string;
  maxPlatforms: number | null;           // null = unlimited
  monthlyGenerationLimit: number | null; // null = unlimited
  canUseHistory: boolean;
  canUseApi: boolean;
  canUseTeam: boolean;
  canUseBatch: boolean;
  speedTier: 'standard' | 'fast' | 'priority' | 'dedicated';
}

// --- Cloud history ---

export interface HistorySummaryItem {
  id: string;
  inputSource: 'manual' | 'extract';
  inputSnippet: string;
  platforms: string[];
  platformCount: number;
  status: 'success' | 'partial' | 'failed';
  modelName: string | null;
  durationMs: number;
  createdAt: string; // ISO 8601
}

export interface HistoryDetailResponse {
  id: string;
  inputSource: 'manual' | 'extract';
  inputContent: string;
  platforms: string[];
  platformCount: number;
  resultJson: Record<string, unknown>;
  status: 'success' | 'partial' | 'failed';
  modelName: string | null;
  durationMs: number;
  createdAt: string; // ISO 8601
}

// --- Billing / payments ---

export interface CheckoutResponseData {
  checkoutUrl: string;
  provider: 'lemonsqueezy';
}

export type SubscriptionStatus =
  | 'active'
  | 'cancelled'
  | 'expired'
  | 'past_due'
  | 'trialing'
  | 'paused';

export interface PricingPlan {
  code: string;
  displayName: string;
  priceMonthly: number;          // in cents (e.g. 999 = $9.99)
  monthlyGenerationLimit: number | null;
  platformLimit: number | null;
  speedTier: 'standard' | 'fast' | 'priority' | 'dedicated';
}

// --- Usage data ---

export interface UsageData {
  currentMonth: string;              // YYYY-MM
  monthlyGenerationCount: number;
  totalGenerationCount: number;
  lastGenerationAt: string | null;   // ISO 8601 or null
  plan: {
    code: string;
    displayName: string;
    monthlyGenerationLimit: number | null;
    platformLimit: number | null;
    speedTier: string;
  };
}

// --- Saved scripts ---

export interface SavedScriptItem {
  id: string;
  title: string;
  contentSnippet: string;
  source: 'manual' | 'extract';
  sourceUrl: string | null;
  createdAt: string;
}

export interface SavedScriptDetail {
  id: string;
  title: string;
  content: string;
  source: 'manual' | 'extract';
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
