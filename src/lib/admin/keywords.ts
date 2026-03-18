import { createServiceRoleClient } from '@/lib/db/client';
import { writeAuditLog } from '@/lib/db/audit-logger';
import { BLOCKED_KEYWORDS } from '@/lib/moderation/keywords';

export interface BlockedKeywordItem {
  id: string;
  keyword: string;
  category: string;
  createdBy: string | null;
  createdAt: string;
}

export interface ListKeywordsParams {
  page: number;
  pageSize: number;
  category?: string;
}

export async function listKeywords(params: ListKeywordsParams) {
  const db = createServiceRoleClient();
  const { page, pageSize, category } = params;
  const offset = (page - 1) * pageSize;

  let query = db
    .from('blocked_keywords')
    .select('id, keyword, category, created_by, created_at', { count: 'exact' });

  if (category) query = query.eq('category', category);

  query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error || !data) return { items: [], total: 0, page, pageSize };

  const items: BlockedKeywordItem[] = data.map((r) => ({
    id: r.id,
    keyword: r.keyword,
    category: r.category,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));

  return { items, total: count ?? 0, page, pageSize };
}

export async function addKeyword(
  keyword: string,
  category: string,
  adminId: string,
): Promise<BlockedKeywordItem> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('blocked_keywords')
    .insert({ keyword, category, created_by: adminId })
    .select('id, keyword, category, created_by, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('关键词已存在');
    }
    throw new Error(`添加关键词失败: ${error.message}`);
  }

  void writeAuditLog({
    action: 'KEYWORD_ADDED',
    userId: adminId,
    resourceType: 'blocked_keyword',
    resourceId: data.id,
    metadata: { keyword, category },
  });

  return {
    id: data.id,
    keyword: data.keyword,
    category: data.category,
    createdBy: data.created_by,
    createdAt: data.created_at,
  };
}

export async function removeKeyword(id: string, adminId: string): Promise<void> {
  const db = createServiceRoleClient();

  // Read keyword for audit
  const { data: existing } = await db
    .from('blocked_keywords')
    .select('keyword')
    .eq('id', id)
    .single();

  const { error } = await db.from('blocked_keywords').delete().eq('id', id);
  if (error) throw new Error(`删除关键词失败: ${error.message}`);

  void writeAuditLog({
    action: 'KEYWORD_REMOVED',
    userId: adminId,
    resourceType: 'blocked_keyword',
    resourceId: id,
    metadata: { keyword: existing?.keyword ?? id },
  });
}

/**
 * Returns all blocked keywords. Reads from DB first, falls back to hardcoded array if empty.
 * Used by the content moderation service.
 */
export async function getAllBlockedKeywords(): Promise<string[]> {
  try {
    const db = createServiceRoleClient();
    const { data, error } = await db
      .from('blocked_keywords')
      .select('keyword');

    if (!error && data && data.length > 0) {
      return data.map((r) => r.keyword);
    }
  } catch { /* fallback */ }

  return [...BLOCKED_KEYWORDS];
}
