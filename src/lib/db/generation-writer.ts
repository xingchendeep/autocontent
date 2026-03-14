import type { PlatformCode } from '@/types';
import type { GenerateAllResult } from '@/lib/ai/service';
import { createServiceRoleClient } from '@/lib/db/client';
import { upsertUsageStats } from '@/lib/db/usage-stats';
import { logger } from '@/lib/logger';

export interface WriteGenerationParams {
  userId: string | null;
  requestId: string;
  content: string;
  platforms: PlatformCode[];
  source: 'manual' | 'extract';
  result: GenerateAllResult;
  promptVersion?: string;
}

/**
 * Resolves the generation status from a GenerateAllResult.
 * - All success (no errors)  → 'success'
 * - Partial (some of each)   → 'partial'
 * - All failed (no results)  → 'failed'
 */
export function resolveStatus(
  result: Pick<GenerateAllResult, 'results' | 'errors'>,
): 'success' | 'partial' | 'failed' {
  const successCount = Object.keys(result.results).length;
  const failCount = Object.keys(result.errors).length;
  if (successCount > 0 && failCount === 0) return 'success';
  if (successCount > 0 && failCount > 0) return 'partial';
  return 'failed';
}

/**
 * Fire-and-forget: writes a generation record to the DB and updates usage_stats.
 * Skips silently for anonymous users (userId null/empty).
 * Never throws — all errors are logged with structured fields.
 */
export function writeGeneration(params: WriteGenerationParams): void {
  const { userId, requestId, content, platforms, source, result, promptVersion } = params;

  // Skip anonymous users
  if (!userId) return;

  void (async () => {
    try {
      const status = resolveStatus(result);

      // Sum tokens across all successful platforms
      const tokensInput = Object.values(result.results).reduce(
        (sum, r) => sum + (r?.tokensInput ?? 0), 0,
      );
      const tokensOutput = Object.values(result.results).reduce(
        (sum, r) => sum + (r?.tokensOutput ?? 0), 0,
      );

      // Error fields: only populated on full failure
      const failedPlatforms = Object.keys(result.errors);
      const errorCode = status === 'failed' ? 'AI_PROVIDER_ERROR' : null;
      const errorMessage =
        failedPlatforms.length > 0 ? `Failed platforms: ${failedPlatforms.join(', ')}` : null;

      const db = createServiceRoleClient();
      const { error: insertError } = await db.from('generations').insert({
        user_id: userId,
        input_source: source,
        input_content: content,
        platforms: platforms as string[],
        platform_count: platforms.length,
        result_json: result.results,
        prompt_version: promptVersion ?? 'v1',
        model_name: result.model || null,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        duration_ms: result.durationMs,
        status,
        error_code: errorCode,
        error_message: errorMessage,
      });

      if (insertError) {
        logger.error('writeGeneration: insert failed', {
          requestId,
          userId,
          errorCode: insertError.code,
          errorMessage: insertError.message,
        });
        return;
      }

      await upsertUsageStats(userId, requestId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('writeGeneration: unexpected error', { requestId, userId, errorMessage: msg });
    }
  })();
}
