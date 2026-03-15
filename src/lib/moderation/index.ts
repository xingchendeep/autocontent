import { BLOCKED_KEYWORDS } from './keywords';

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
 * Checks `content` against the blocked keyword list.
 *
 * Returns { blocked: false } when content is clean.
 * Returns { blocked: true, reason: 'KEYWORD_MATCH', matchedKeywords } when blocked —
 * callers are responsible for keeping matchedKeywords out of external outputs.
 *
 * Pure synchronous function — no I/O, no side effects.
 */
export function checkContent(content: string): ModerationResult {
  const lower = content.toLowerCase();
  const matched = BLOCKED_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));

  if (matched.length > 0) {
    return { blocked: true, reason: 'KEYWORD_MATCH', matchedKeywords: matched };
  }

  return { blocked: false };
}
