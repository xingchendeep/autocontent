import { createServiceRoleClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';

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

export async function getSummary(): Promise<AnalyticsSummary> {
  const db = createServiceRoleClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const [profilesRes, todayGensRes, totalGensRes] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('generations').select('user_id', { count: 'exact' }).gte('created_at', todayISO),
    db.from('generations').select('id', { count: 'exact', head: true }),
  ]);

  // Count distinct active users today
  const todayUserIds = new Set(
    (todayGensRes.data ?? []).map((g) => g.user_id).filter(Boolean),
  );

  return {
    totalUsers: profilesRes.count ?? 0,
    todayActiveUsers: todayUserIds.size,
    totalGenerations: totalGensRes.count ?? 0,
    todayGenerations: todayGensRes.count ?? 0,
  };
}

export async function getGenerationTrends(days: number = 30): Promise<DailyTrend[]> {
  const db = createServiceRoleClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await db.rpc('admin_generation_trends', {
    since_date: since.toISOString().split('T')[0],
  });

  // If RPC doesn't exist, fall back to client-side aggregation
  if (error || !data) {
    const { data: gens } = await db
      .from('generations')
      .select('created_at')
      .gte('created_at', since.toISOString())
      .order('created_at');

    const countMap = new Map<string, number>();
    for (const g of gens ?? []) {
      const date = g.created_at.split('T')[0];
      countMap.set(date, (countMap.get(date) ?? 0) + 1);
    }

    const result: DailyTrend[] = [];
    const cursor = new Date(since);
    const now = new Date();
    while (cursor <= now) {
      const dateStr = cursor.toISOString().split('T')[0];
      result.push({ date: dateStr, count: countMap.get(dateStr) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  return data as DailyTrend[];
}

export async function getPlatformDistribution(days: number = 30): Promise<PlatformDistribution[]> {
  const db = createServiceRoleClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data: gens } = await db
    .from('generations')
    .select('platforms')
    .gte('created_at', since.toISOString());

  const countMap = new Map<string, number>();
  let total = 0;
  for (const g of gens ?? []) {
    for (const p of g.platforms ?? []) {
      countMap.set(p, (countMap.get(p) ?? 0) + 1);
      total++;
    }
  }

  return Array.from(countMap.entries())
    .map(([platform, count]) => ({
      platform,
      count,
      percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function getTopUsers(limit: number = 10): Promise<TopUser[]> {
  const db = createServiceRoleClient();
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const { data: usageRows } = await db
    .from('usage_stats')
    .select('user_id, monthly_generation_count')
    .eq('current_month', currentMonth)
    .order('monthly_generation_count', { ascending: false })
    .limit(limit);

  if (!usageRows || usageRows.length === 0) return [];

  const userIds = usageRows.map((u) => u.user_id);

  // Fetch emails
  const emailMap = new Map<string, string>();
  try {
    const { data: { users } } = await db.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users) { if (u.email) emailMap.set(u.id, u.email); }
  } catch { /* ignore */ }

  // Fetch subscriptions
  const { data: subs } = await db
    .from('current_active_subscriptions')
    .select('user_id, plan_code')
    .in('user_id', userIds);
  const subMap = new Map((subs ?? []).map((s) => [s.user_id, s.plan_code]));

  return usageRows.map((u) => ({
    userId: u.user_id,
    email: emailMap.get(u.user_id) ?? '',
    generationCount: u.monthly_generation_count,
    planCode: subMap.get(u.user_id) ?? null,
  }));
}

export async function getSubscriptionDistribution(): Promise<SubscriptionDistribution[]> {
  const db = createServiceRoleClient();

  const { data: subs } = await db
    .from('current_active_subscriptions')
    .select('plan_code, plan_display_name');

  if (!subs || subs.length === 0) return [];

  const countMap = new Map<string, { name: string; count: number }>();
  for (const s of subs) {
    const existing = countMap.get(s.plan_code);
    if (existing) {
      existing.count++;
    } else {
      countMap.set(s.plan_code, { name: s.plan_display_name, count: 1 });
    }
  }

  return Array.from(countMap.entries()).map(([code, { name, count }]) => ({
    planCode: code,
    planName: name,
    count,
  }));
}
