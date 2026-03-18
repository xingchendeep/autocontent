import { createServiceRoleClient } from '@/lib/db/client';
import { writeAuditLog } from '@/lib/db/audit-logger';
import { logger } from '@/lib/logger';

export interface AdminScriptItem {
  id: string;
  userId: string;
  userEmail: string | null;
  title: string;
  contentSnippet: string;
  source: string;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListScriptsParams {
  page: number;
  pageSize: number;
  userId?: string;
  search?: string;
  source?: string;
}

export async function listScripts(params: ListScriptsParams) {
  const db = createServiceRoleClient();
  const { page, pageSize, userId, search, source } = params;
  const offset = (page - 1) * pageSize;

  let query = db
    .from('saved_scripts')
    .select('id, user_id, title, content, source, source_url, created_at, updated_at', { count: 'exact' });

  if (userId) query = query.eq('user_id', userId);
  if (source) query = query.eq('source', source);
  if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);

  query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error || !data) {
    logger.error('admin listScripts failed', { error: error?.message });
    return { items: [], total: 0, page, pageSize };
  }

  // Fetch emails
  const userIds = [...new Set(data.map((s) => s.user_id as string))];
  const emailMap = new Map<string, string>();
  if (userIds.length > 0) {
    try {
      const { data: { users } } = await db.auth.admin.listUsers({ perPage: 1000 });
      for (const u of users) {
        if (u.email) emailMap.set(u.id, u.email);
      }
    } catch { /* ignore */ }
  }

  const items: AdminScriptItem[] = data.map((s) => ({
    id: s.id,
    userId: s.user_id,
    userEmail: emailMap.get(s.user_id) ?? null,
    title: s.title,
    contentSnippet: (s.content ?? '').slice(0, 120),
    source: s.source,
    sourceUrl: s.source_url,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }));

  return { items, total: count ?? 0, page, pageSize };
}

export async function deleteScript(id: string, adminId: string) {
  const db = createServiceRoleClient();

  const { data: script, error: readErr } = await db
    .from('saved_scripts')
    .select('id, user_id, title')
    .eq('id', id)
    .single();

  if (readErr || !script) throw new Error('脚本不存在');

  const { error: delErr } = await db
    .from('saved_scripts')
    .delete()
    .eq('id', id);

  if (delErr) throw new Error(delErr.message);

  await writeAuditLog({
    userId: adminId,
    action: 'KEYWORD_REMOVED',
    resourceType: 'saved_script',
    resourceId: id,
    metadata: { title: script.title, scriptUserId: script.user_id },
  });
}
