import { createServiceRoleClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';

/**
 * Upserts usage_stats for the given user after a successful generation.
 * Handles month rollover by resetting monthly_generation_count.
 * Never throws — errors are logged with structured fields.
 */
export async function upsertUsageStats(userId: string, requestId: string): Promise<void> {
  try {
    const db = createServiceRoleClient();
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    const { data: existing, error: selectError } = await db
      .from('usage_stats')
      .select('current_month, monthly_generation_count, total_generation_count')
      .eq('user_id', userId)
      .maybeSingle();

    if (selectError) {
      logger.error('upsertUsageStats: select failed', {
        requestId,
        userId,
        errorMessage: selectError.message,
      });
      return;
    }

    let monthly: number;
    let total: number;

    if (!existing) {
      // First generation ever
      monthly = 1;
      total = 1;
    } else if (existing.current_month === currentMonth) {
      // Same month — increment both
      monthly = existing.monthly_generation_count + 1;
      total = existing.total_generation_count + 1;
    } else {
      // Month rollover — reset monthly, increment total
      monthly = 1;
      total = existing.total_generation_count + 1;
    }

    const { error: upsertError } = await db.from('usage_stats').upsert(
      {
        user_id: userId,
        current_month: currentMonth,
        monthly_generation_count: monthly,
        total_generation_count: total,
        last_generation_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (upsertError) {
      logger.error('upsertUsageStats: upsert failed', {
        requestId,
        userId,
        errorMessage: upsertError.message,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('upsertUsageStats: unexpected error', { requestId, userId, errorMessage: msg });
  }
}
