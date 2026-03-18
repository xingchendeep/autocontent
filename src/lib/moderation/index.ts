import { BLOCKED_KEYWORDS } from './keywords';
import { createServiceRoleClient } from '@/lib/db/client';

export interface ModerationResult {
  blocked: boolean;
  reason?: 'KEYWORD_MATCH';
  /**
   * Matched keywords — for internal logging ONLY.
   * MUST NOT be serialised into any HTTP response or stored in audit_logs.
   */
  matchedKeywords?: string[];
}

/**
 * Resolves the blocked keyword list.
 * Reads from the database first; falls back to the hardcoded constant on error or empty table.
 */
async function resolveBlockedKeywords(): Promise<readonly string[]> {
  try {
    const db = createServiceRoleClient();
    const { data, error } = await db
      .from('blocked_keywords')
      .select('keyword');

    if (!error && data && data.length > 0) {
      return data.map((r) => r.keyword);
    }
  } catch {
    // Fall through to constant
  }
  return BLOCKED_KEYWORDS;
}

/**
 * Checks `content` against the blocked keyword list.
 * Now async — reads from DB with fallback to hardcoded list.
 */
export async function checkContent(content: string): Promise<ModerationResult> {
  const keywords = await resolveBlockedKeywords();
  const lower = content.toLowerCase();
  const matched = keywords.filter((kw) => lower.includes(kw.toLowerCase()));

  if (matched.length > 0) {
    return { blocked: true, reason: 'KEYWORD_MATCH', matchedKeywords: [...matched] };
  }

  return { blocked: false };
}
