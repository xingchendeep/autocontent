import { createServiceRoleClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';

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

export interface ListGenerationsParams {
  page: number;
  pageSize: number;
  userId?: string;
  platform?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}

export async function listGenerations(params: ListGenerationsParams) {
  const db = createServiceRoleClient();
  const { page, pageSize, userId, platform, status, startDate, endDate, search, sortBy, sortOrder } = params;
  const offset = (page - 1) * pageSize;

  let query = db
    .from('generations')
    .select('id, user_id, input_content, platforms, status, model_name, duration_ms, tokens_input, tokens_output, created_at', { count: 'exact' });

  if (userId) query = query.eq('user_id', userId);
  if (status) query = query.eq('status', status);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);
  if (platform) query = query.contains('platforms', [platform]);
  if (search) query = query.ilike('input_content', `%${search}%`);

  const col = sortBy === 'duration_ms' ? 'duration_ms' : sortBy === 'tokens_input' ? 'tokens_input' : 'created_at';
  query = query.order(col, { ascending: sortOrder === 'asc' }).range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error || !data) {
    logger.error('listGenerations failed', { error: error?.message });
    return { items: [], total: 0, page, pageSize };
  }

  // Fetch emails for user_ids
  const userIds = [...new Set(data.filter((g) => g.user_id).map((g) => g.user_id as string))];
  const emailMap = new Map<string, string>();
  if (userIds.length > 0) {
    try {
      const { data: { users: authUsers } } = await db.auth.admin.listUsers({ perPage: 1000 });
      for (const u of authUsers) {
        if (u.email) emailMap.set(u.id, u.email);
      }
    } catch { /* ignore */ }
  }

  const items: AdminGenerationItem[] = data.map((g) => ({
    id: g.id,
    userEmail: g.user_id ? (emailMap.get(g.user_id) ?? null) : null,
    inputSnippet: (g.input_content ?? '').slice(0, 100),
    platforms: g.platforms,
    status: g.status,
    modelName: g.model_name,
    durationMs: g.duration_ms,
    tokensInput: g.tokens_input,
    tokensOutput: g.tokens_output,
    createdAt: g.created_at,
  }));

  return { items, total: count ?? 0, page, pageSize };
}

export async function getGenerationDetail(id: string) {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('generations')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;

  let userEmail: string | null = null;
  if (data.user_id) {
    try {
      const { data: { user } } = await db.auth.admin.getUserById(data.user_id);
      userEmail = user?.email ?? null;
    } catch { /* ignore */ }
  }

  return {
    id: data.id,
    userId: data.user_id,
    userEmail,
    inputSource: data.input_source,
    inputContent: data.input_content,
    extractedUrl: data.extracted_url,
    platforms: data.platforms,
    platformCount: data.platform_count,
    resultJson: data.result_json,
    promptVersion: data.prompt_version,
    modelName: data.model_name,
    tokensInput: data.tokens_input,
    tokensOutput: data.tokens_output,
    durationMs: data.duration_ms,
    status: data.status,
    errorCode: data.error_code,
    errorMessage: data.error_message,
    createdAt: data.created_at,
  };
}

export async function deleteGeneration(id: string, adminId: string) {
  const db = createServiceRoleClient();

  const { data: gen, error: readErr } = await db
    .from('generations')
    .select('id, user_id, status')
    .eq('id', id)
    .single();

  if (readErr || !gen) throw new Error('生成记录不存在');

  const { error: delErr } = await db
    .from('generations')
    .delete()
    .eq('id', id);

  if (delErr) throw new Error(delErr.message);

  const { writeAuditLog } = await import('@/lib/db/audit-logger');
  await writeAuditLog({
    userId: adminId,
    action: 'KEYWORD_REMOVED',
    resourceType: 'generation',
    resourceId: id,
    metadata: { generationUserId: gen.user_id, status: gen.status },
  });
}
