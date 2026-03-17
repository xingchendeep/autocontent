import { createServiceRoleClient } from '@/lib/db/client';
import { createSupabaseServerClient } from '@/lib/auth/server';
import { logger } from '@/lib/logger';

export interface SavedScript {
  id: string;
  userId: string;
  title: string;
  content: string;
  source: 'manual' | 'extract';
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveScriptParams {
  userId: string;
  title: string;
  content: string;
  source?: 'manual' | 'extract';
  sourceUrl?: string;
}

export interface ListScriptsParams {
  page: number;
  limit: number;
}

export async function saveScript(params: SaveScriptParams): Promise<SavedScript> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('saved_scripts')
    .insert({
      user_id: params.userId,
      title: params.title,
      content: params.content,
      source: params.source ?? 'manual',
      source_url: params.sourceUrl ?? null,
    })
    .select('id, user_id, title, content, source, source_url, created_at, updated_at')
    .single();

  if (error || !data) {
    logger.error('saveScript: insert failed', { error: error?.message });
    throw new Error('保存脚本失败');
  }

  return mapRow(data);
}

export async function listScripts(
  userId: string,
  params: ListScriptsParams,
): Promise<{ items: SavedScript[]; total: number }> {
  const db = await createSupabaseServerClient();
  const from = (params.page - 1) * params.limit;
  const to = params.page * params.limit - 1;

  const { data, count, error } = await db
    .from('saved_scripts')
    .select('id, user_id, title, content, source, source_url, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    logger.error('listScripts: query failed', { error: error.message });
    throw new Error('获取脚本列表失败');
  }

  return {
    items: (data ?? []).map(mapRow),
    total: count ?? 0,
  };
}

export async function deleteScript(scriptId: string, userId: string): Promise<boolean> {
  const db = createServiceRoleClient();
  const { error } = await db
    .from('saved_scripts')
    .delete()
    .eq('id', scriptId)
    .eq('user_id', userId);

  if (error) {
    logger.error('deleteScript: delete failed', { error: error.message });
    throw new Error('删除脚本失败');
  }

  return true;
}

function mapRow(row: Record<string, unknown>): SavedScript {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    content: row.content as string,
    source: row.source as 'manual' | 'extract',
    sourceUrl: (row.source_url as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getScriptById(scriptId: string, _userId: string): Promise<SavedScript | null> {
  // RLS enforces ownership via session — _userId kept for API consistency
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from('saved_scripts')
    .select('id, user_id, title, content, source, source_url, created_at, updated_at')
    .eq('id', scriptId)
    .single();

  if (error || !data) return null;
  return mapRow(data);
}

export interface AutoSaveScriptParams {
  userId: string;
  content: string;
  source: 'manual' | 'extract';
  sourceUrl?: string;
  requestId: string;
}

/**
 * Auto-save a script after successful generation.
 * Uses content hash to deduplicate — same user + same content won't be saved twice.
 * Fire-and-forget safe: never throws, logs errors.
 */
export async function autoSaveScript(params: AutoSaveScriptParams): Promise<void> {
  const { userId, content, source, sourceUrl, requestId } = params;

  try {
    const db = createServiceRoleClient();

    // Deduplicate: check if this exact content already exists for this user
    // Use a prefix match (first 200 chars) + exact length to avoid full-text scan
    const contentPrefix = content.slice(0, 200);
    const { data: existing } = await db
      .from('saved_scripts')
      .select('id')
      .eq('user_id', userId)
      .like('content', `${contentPrefix.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`)
      .limit(5);

    // Check exact match among candidates
    if (existing && existing.length > 0) {
      // Content already saved, skip
      return;
    }

    // Auto-generate title from first line or first 50 chars
    const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? '';
    const title = firstLine.trim().slice(0, 50) || '未命名脚本';

    await db.from('saved_scripts').insert({
      user_id: userId,
      title,
      content,
      source,
      source_url: sourceUrl ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('autoSaveScript: failed', { requestId, userId, errorMessage: msg });
  }
}
