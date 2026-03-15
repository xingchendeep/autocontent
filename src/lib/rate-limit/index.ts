import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number; // -1 if Redis unavailable
  resetAt: number;   // Unix timestamp; -1 if Redis unavailable
}

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

/**
 * Constructs a Redis key for rate limiting.
 * Format: rl:{scope}:{dimension}:{identifier}:{windowLabel}
 */
export function buildRateLimitKey(
  scope: 'generate' | 'extract',
  dimension: 'ip' | 'user',
  identifier: string,
  windowLabel: '1h',
): string {
  return `rl:${scope}:${dimension}:${identifier}:${windowLabel}`;
}

/**
 * Increments the counter for `key` in Upstash Redis using a pipeline.
 * Uses SET NX (set if not exists with TTL) + INCR for atomic counter with TTL.
 *
 * Falls back to { allowed: true, remaining: -1, resetAt: -1 } on Redis failure
 * so that rate limit errors never block requests.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const redis = getRedis();
    const resetAt = Math.floor(Date.now() / 1000) + windowSeconds;

    // Pipeline: SET key 0 EX windowSeconds NX (initialise if absent), then INCR
    const pipeline = redis.pipeline();
    pipeline.set(key, 0, { ex: windowSeconds, nx: true });
    pipeline.incr(key);
    const results = await pipeline.exec();

    // results[1] is the value after INCR
    const count = results[1] as number;

    if (count > limit) {
      return { allowed: false, remaining: 0, resetAt };
    }

    return { allowed: true, remaining: limit - count, resetAt };
  } catch (err) {
    logger.warn('checkRateLimit: Redis unavailable, failing open', {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true, remaining: -1, resetAt: -1 };
  }
}
