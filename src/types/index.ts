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
  provider: 'creem';
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

// --- v2: Template types ---

export type ToneValue = 'professional' | 'casual' | 'humorous' | 'authoritative' | 'empathetic';
export type LengthValue = 'short' | 'medium' | 'long';

export interface UserTemplate {
  id: string;
  userId: string;
  name: string;
  tone: ToneValue;
  length: LengthValue;
  customInstructions?: string;
  platformOverrides: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// --- v2: Batch job types ---

export type BatchJobStatusValue = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';

export interface BatchJobStatus {
  jobId: string;
  status: BatchJobStatusValue;
  itemCount: number;
  completedCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  items?: BatchJobItem[];
}

export interface BatchJobItem {
  itemId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  results: Partial<Record<PlatformCode, GeneratePlatformOutput>> | null;
  errorMessage?: string;
}

// --- v2: Team types ---

export type TeamRole = 'owner' | 'admin' | 'member';

export interface TeamSummary {
  id: string;
  name: string;
  role: TeamRole;
  memberCount: number;
}

export interface TeamMember {
  userId: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  teamName: string;
  role: TeamRole;
  expired: boolean;
}
