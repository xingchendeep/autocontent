import { NextRequest, NextResponse } from 'next/server';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createError,
} from '@/lib/errors';
import { getSession } from '@/lib/auth';
import { checkRateLimit, buildRateLimitKey } from '@/lib/rate-limit';
import { getPlanCapability } from '@/lib/billing/plan-capability';

/**
 * POST /api/extract
 * Extracts content from a video URL.
 * Rate limiting is enforced before any external network call.
 *
 * TODO: implement actual URL extraction logic (Phase 6 / v2.0 scope).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  const session = await getSession();
  const userId = session?.id ?? null;

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  // ── Rate limiting ──
  if (!userId) {
    // Anonymous: 3 req/h per IP
    const rl = await checkRateLimit(
      buildRateLimitKey('extract', 'ip', ip, '1h'),
      3,
      3600,
    );
    if (!rl.allowed) {
      return NextResponse.json(
        createError(ERROR_CODES.RATE_LIMITED, '请求过于频繁，请稍后再试', requestId, {
          retryAfter: rl.resetAt,
        }),
        { status: ERROR_STATUS.RATE_LIMITED, headers: { 'x-request-id': requestId } },
      );
    }
  } else {
    let planCode = 'free';
    try {
      const cap = await getPlanCapability(userId);
      planCode = cap.planCode;
    } catch {
      // Non-fatal — fall back to free-tier limits
    }

    const isPaid = planCode !== 'free';
    const userLimit = isPaid ? 30 : 10;

    const rl = await checkRateLimit(
      buildRateLimitKey('extract', 'user', userId, '1h'),
      userLimit,
      3600,
    );
    if (!rl.allowed) {
      return NextResponse.json(
        createError(ERROR_CODES.RATE_LIMITED, '请求过于频繁，请稍后再试', requestId, {
          retryAfter: rl.resetAt,
        }),
        { status: ERROR_STATUS.RATE_LIMITED, headers: { 'x-request-id': requestId } },
      );
    }
  }

  // TODO: implement URL extraction logic
  return NextResponse.json(
    createError(ERROR_CODES.SERVICE_UNAVAILABLE, 'URL extraction is not yet implemented', requestId),
    { status: ERROR_STATUS.SERVICE_UNAVAILABLE, headers: { 'x-request-id': requestId } },
  );
}
