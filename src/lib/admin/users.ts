import { createServiceRoleClient } from '@/lib/db/client';
import { writeAuditLog } from '@/lib/db/audit-logger';
import { logger } from '@/lib/logger';

export interface AdminUserItem {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
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

export interface ListUsersParams {
  page: number;
  pageSize: number;
  search?: string;
  role?: string;
  plan?: string;
  status?: string;
}

export async function listUsers(params: ListUsersParams) {
  const db = createServiceRoleClient();
  const { page, pageSize, search, role, plan, status } = params;
  const offset = (page - 1) * pageSize;

  // Build query on profiles joined with usage_stats
  let query = db
    .from('profiles')
    .select('id, display_name, role, is_disabled, created_at', { count: 'exact' });

  if (search) {
    query = query.or(`display_name.ilike.%${search}%`);
  }
  if (role) {
    query = query.eq('role', role);
  }
  if (status === 'disabled') {
    query = query.eq('is_disabled', true);
  } else if (status === 'active') {
    query = query.eq('is_disabled', false);
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

  const { data: profiles, error, count } = await query;

  if (error || !profiles) {
    logger.error('listUsers failed', { error: error?.message });
    return { items: [], total: 0, page, pageSize };
  }

  const userIds = profiles.map((p) => p.id);

  // Fetch usage stats
  const { data: usageRows } = await db
    .from('usage_stats')
    .select('user_id, total_generation_count')
    .in('user_id', userIds);
  const usageMap = new Map((usageRows ?? []).map((u) => [u.user_id, u.total_generation_count]));

  // Fetch active subscriptions
  const { data: subRows } = await db
    .from('current_active_subscriptions')
    .select('user_id, plan_code')
    .in('user_id', userIds);
  const subMap = new Map((subRows ?? []).map((s) => [s.user_id, s.plan_code]));

  // Filter by plan if requested
  let items: AdminUserItem[] = profiles.map((p) => ({
    id: p.id,
    email: '', // will be filled below
    displayName: p.display_name,
    role: p.role,
    planCode: subMap.get(p.id) ?? null,
    generationCount: usageMap.get(p.id) ?? 0,
    isDisabled: p.is_disabled,
    createdAt: p.created_at,
  }));

  if (plan) {
    items = items.filter((i) => i.planCode === plan);
  }

  // Fetch emails via Supabase Admin API
  try {
    const { data: { users: authUsers } } = await db.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map(authUsers.map((u) => [u.id, u.email ?? '']));
    for (const item of items) {
      item.email = emailMap.get(item.id) ?? '';
    }
  } catch {
    logger.warn('listUsers: failed to fetch auth users for emails');
  }

  return { items, total: count ?? 0, page, pageSize };
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const db = createServiceRoleClient();

  const { data: profile } = await db
    .from('profiles')
    .select('id, display_name, role, is_disabled, created_at')
    .eq('id', userId)
    .single();

  if (!profile) return null;

  // Email
  let email = '';
  try {
    const { data: { user: authUser } } = await db.auth.admin.getUserById(userId);
    email = authUser?.email ?? '';
  } catch { /* ignore */ }

  // Subscription
  const { data: sub } = await db
    .from('current_active_subscriptions')
    .select('plan_code, plan_display_name, status, current_period_end')
    .eq('user_id', userId)
    .single();

  // Usage
  const { data: usage } = await db
    .from('usage_stats')
    .select('current_month, monthly_generation_count, total_generation_count')
    .eq('user_id', userId)
    .single();

  // Recent generations
  const { data: gens } = await db
    .from('generations')
    .select('id, platforms, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    id: profile.id,
    email,
    displayName: profile.display_name,
    role: profile.role,
    planCode: sub?.plan_code ?? null,
    generationCount: usage?.total_generation_count ?? 0,
    isDisabled: profile.is_disabled,
    createdAt: profile.created_at,
    subscription: sub
      ? {
          planCode: sub.plan_code,
          planName: sub.plan_display_name,
          status: sub.status,
          currentPeriodEnd: sub.current_period_end,
        }
      : null,
    usageStats: usage
      ? {
          currentMonth: usage.current_month,
          monthlyCount: usage.monthly_generation_count,
          totalCount: usage.total_generation_count,
        }
      : null,
    recentGenerations: (gens ?? []).map((g) => ({
      id: g.id,
      platforms: g.platforms,
      status: g.status,
      createdAt: g.created_at,
    })),
  };
}

export async function updateUserStatus(
  userId: string,
  isDisabled: boolean,
  adminId: string,
): Promise<void> {
  const db = createServiceRoleClient();
  const { error } = await db
    .from('profiles')
    .update({ is_disabled: isDisabled })
    .eq('id', userId);

  if (error) throw new Error(`更新用户状态失败: ${error.message}`);

  void writeAuditLog({
    action: isDisabled ? 'USER_DISABLED' : 'USER_ENABLED',
    userId: adminId,
    resourceType: 'user',
    resourceId: userId,
    metadata: { targetUserId: userId, isDisabled },
  });
}

export async function updateUserRole(
  userId: string,
  role: string,
  adminId: string,
): Promise<void> {
  const db = createServiceRoleClient();

  // Read old role for audit
  const { data: old } = await db
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  const { error } = await db
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  if (error) throw new Error(`更新用户角色失败: ${error.message}`);

  void writeAuditLog({
    action: 'USER_ROLE_CHANGED',
    userId: adminId,
    resourceType: 'user',
    resourceId: userId,
    metadata: { targetUserId: userId, oldRole: old?.role, newRole: role },
  });
}

export async function updateUserSubscription(
  userId: string,
  planCode: string,
  adminId: string,
): Promise<void> {
  const db = createServiceRoleClient();

  // Find plan
  const { data: plan } = await db
    .from('plans')
    .select('id, code')
    .eq('code', planCode)
    .single();

  if (!plan) throw new Error(`计划不存在: ${planCode}`);

  // Get current subscription
  const { data: currentSub } = await db
    .from('current_active_subscriptions')
    .select('id, plan_code')
    .eq('user_id', userId)
    .single();

  const oldPlanCode = currentSub?.plan_code ?? 'none';

  if (currentSub) {
    // Update existing
    const { error } = await db
      .from('subscriptions')
      .update({ plan_id: plan.id })
      .eq('id', currentSub.id);
    if (error) throw new Error(`更新订阅失败: ${error.message}`);
  } else {
    // Create new
    const { error } = await db.from('subscriptions').insert({
      user_id: userId,
      plan_id: plan.id,
      status: 'active',
      current_period_start: new Date().toISOString(),
    });
    if (error) throw new Error(`创建订阅失败: ${error.message}`);
  }

  void writeAuditLog({
    action: 'SUBSCRIPTION_ADMIN_CHANGED',
    userId: adminId,
    resourceType: 'subscription',
    resourceId: userId,
    metadata: { targetUserId: userId, oldPlanCode, newPlanCode: planCode },
  });
}
