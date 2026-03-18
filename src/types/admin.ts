// Admin panel shared type definitions

export interface AdminUserItem {
  id: string;
  email: string;
  displayName: string | null;
  role: 'user' | 'admin' | 'super_admin';
  planCode: string | null;
  generationCount: number;
  isDisabled: boolean;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserItem {
  subscription: {
    planCode: string;
    planName: string;
    status: string;
    currentPeriodEnd: string | null;
  } | null;
  usageStats: {
    currentMonth: string;
    monthlyCount: number;
    totalCount: number;
  } | null;
  recentGenerations: Array<{
    id: string;
    platforms: string[];
    status: string;
    createdAt: string;
  }>;
}

export interface SiteSetting {
  key: string;
  value: string;
  valueType: 'string' | 'integer' | 'boolean' | 'json';
  updatedBy: string | null;
  updatedAt: string;
}

export interface SystemTemplate {
  platform: string;
  displayName: string;
  promptInstructions: string;
  maxTitleLength: number;
  maxContentLength: number;
  hashtagStyle: 'inline' | 'trailing' | 'none';
  promptVersion: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface BlockedKeywordItem {
  id: string;
  keyword: string;
  category: string;
  createdBy: string | null;
  createdAt: string;
}

export interface SystemConfigItem {
  key: string;
  value: string;
  valueType: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface AuditLogItem {
  id: string;
  userEmail: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AnalyticsSummary {
  totalUsers: number;
  todayActiveUsers: number;
  totalGenerations: number;
  todayGenerations: number;
}

export interface DailyTrend {
  date: string;
  count: number;
}

export interface PlatformDistribution {
  platform: string;
  count: number;
  percentage: number;
}

export interface TopUser {
  userId: string;
  email: string;
  generationCount: number;
  planCode: string | null;
}

export interface SubscriptionDistribution {
  planCode: string;
  planName: string;
  count: number;
}

export interface AdminGenerationItem {
  id: string;
  userEmail: string | null;
  inputSnippet: string;
  platforms: string[];
  status: string;
  modelName: string | null;
  durationMs: number;
  tokensInput: number;
  tokensOutput: number;
  createdAt: string;
}

export interface AdminGenerationDetail extends AdminGenerationItem {
  userId: string | null;
  inputSource: string;
  inputContent: string;
  resultJson: Record<string, unknown>;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
