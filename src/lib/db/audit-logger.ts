import { createServiceRoleClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';

// All audit event types — UPPER_SNAKE_CASE
export type AuditAction =
  | 'USER_SIGN_IN'
  | 'USER_SIGN_IN_FAILED'
  | 'SUBSCRIPTION_CREATED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'SUBSCRIPTION_UPDATED'
  | 'ORDER_CREATED'
  | 'GENERATION_FAILED'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'CHECKOUT_FAILED'
  | 'CONTENT_BLOCKED';

export interface AuditLogEntry {
  action: AuditAction;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Writes one row to audit_logs using the service role client (bypasses RLS).
 *
 * NEVER throws — all errors are caught and logged as warnings.
 * Callers should use `void writeAuditLog(...)` to ensure fire-and-forget behaviour.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const db = createServiceRoleClient();
    const { error } = await db.from('audit_logs').insert({
      action: entry.action,
      user_id: entry.userId ?? null,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      metadata: entry.metadata ?? null,
    });

    if (error) {
      logger.warn('writeAuditLog: insert failed', {
        action: entry.action,
        userId: entry.userId,
        errorCode: error.code,
        errorMessage: error.message,
      });
    }
  } catch (err) {
    logger.warn('writeAuditLog: unexpected error', {
      action: entry.action,
      userId: entry.userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
