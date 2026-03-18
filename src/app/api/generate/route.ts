import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SUPPORTED_PLATFORMS } from '@/lib/ai/templates';
import { generateAll } from '@/lib/ai/service';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth';
import { writeGeneration } from '@/lib/db/generation-writer';
import { getPlanCapability } from '@/lib/billing/plan-capability';
import { createServiceRoleClient } from '@/lib/db/client';
import { checkRateLimit, buildRateLimitKey } from '@/lib/rate-limit';
import { checkContent } from '@/lib/moderation';
import { writeAuditLog } from '@/lib/db/audit-logger';
import { getTemplateById } from '@/lib/templates/service';
import { getSystemConfigInt } from '@/lib/admin/system-config';
import type { PlatformCode, GenerateResponse } from '@/types';

const platformCodeSchema = z.enum(
  SUPPORTED_PLATFORMS as [PlatformCode, ...PlatformCode[]],
);

const requestSchema = z.object({
  content: z.string().min(1).max(100000),
  platforms: z.array(platformCodeSchema).min(1).max(10),
  source: z.enum(['manual', 'extract']).optional(),
  templateId: z.string().uuid().optional(),
  options: z
    .object({
      tone: z.enum(['professional', 'casual', 'humorous', 'authoritative', 'empathetic']).optional(),
      length: z.enum(['short', 'medium', 'long']).optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();
  const start = Date.now();

  logger.info('generate request received', { requestId });

  // Resolve session — null = anonymous
  const session = await getSession();
  const userId = session?.id ?? null;

  // Extract IP for rate limiting
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logger.warn('invalid json body', { requestId });
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, 'Request body must be valid JSON', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const contentIssues = parsed.error.issues.filter(
      (i) => i.path[0] === 'content' && i.code === 'too_big',
    );
    if (contentIssues.length > 0) {
      return NextResponse.json(
        createError(
          ERROR_CODES.CONTENT_TOO_LONG,
          'Content exceeds the maximum allowed length of 100000 characters',
          requestId,
        ),
        { status: ERROR_STATUS.CONTENT_TOO_LONG, headers: { 'x-request-id': requestId } },
      );
    }
    const platformIssues = parsed.error.issues.filter((i) => i.path[0] === 'platforms');
    if (platformIssues.length > 0) {
      return NextResponse.json(
        createError(ERROR_CODES.INVALID_PLATFORM, 'One or more platform codes are not supported', requestId, {
          details: flat,
        }),
        { status: ERROR_STATUS.INVALID_PLATFORM, headers: { 'x-request-id': requestId } },
      );
    }
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, 'Request body validation failed', requestId, { details: flat }),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const { content, platforms, options, templateId } = parsed.data;

  // ── Rate limiting (after Zod validation, before plan check and moderation) ──
  const rateLimitPerMinute = await getSystemConfigInt('rate_limit_per_minute', 20);
  if (!userId) {
    // Anonymous: IP only, use system config rate limit
    const rl = await checkRateLimit(
      buildRateLimitKey('generate', 'ip', ip, '1h'),
      rateLimitPerMinute * 3, // scale per-minute to per-hour
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
    // Determine plan tier for rate limit thresholds
    let planCode = 'free';
    try {
      const cap = await getPlanCapability(userId);
      planCode = cap.planCode;
    } catch {
      // Non-fatal — fall back to free-tier limits
    }

    const isPaid = planCode !== 'free';
    const userLimit = isPaid ? 100 : 20;
    const ipLimit = isPaid ? 30 : 10;

    const [userRl, ipRl] = await Promise.all([
      checkRateLimit(buildRateLimitKey('generate', 'user', userId, '1h'), userLimit, 3600),
      checkRateLimit(buildRateLimitKey('generate', 'ip', ip, '1h'), ipLimit, 3600),
    ]);

    const blocked = !userRl.allowed ? userRl : !ipRl.allowed ? ipRl : null;
    if (blocked) {
      return NextResponse.json(
        createError(ERROR_CODES.RATE_LIMITED, '请求过于频繁，请稍后再试', requestId, {
          retryAfter: blocked.resetAt,
        }),
        { status: ERROR_STATUS.RATE_LIMITED, headers: { 'x-request-id': requestId } },
      );
    }
  }

  // ── Plan capability enforcement (authenticated users only) ──
  if (userId) {
    let capability;
    try {
      capability = await getPlanCapability(userId);
    } catch {
      return NextResponse.json(
        createError(ERROR_CODES.SERVICE_UNAVAILABLE, '无法获取套餐信息', requestId),
        { status: ERROR_STATUS.SERVICE_UNAVAILABLE, headers: { 'x-request-id': requestId } },
      );
    }

    if (capability.maxPlatforms !== null && platforms.length > capability.maxPlatforms) {
      return NextResponse.json(
        createError(ERROR_CODES.PLAN_LIMIT_REACHED, '已超出套餐平台数量限制', requestId),
        { status: ERROR_STATUS.PLAN_LIMIT_REACHED, headers: { 'x-request-id': requestId } },
      );
    }

    if (capability.monthlyGenerationLimit !== null) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const db = createServiceRoleClient();
      const { data: stats } = await db
        .from('usage_stats')
        .select('current_month, monthly_generation_count')
        .eq('user_id', userId)
        .maybeSingle();

      const monthlyCount =
        stats && stats.current_month === currentMonth
          ? (stats.monthly_generation_count as number)
          : 0;

      if (monthlyCount >= capability.monthlyGenerationLimit) {
        return NextResponse.json(
          createError(ERROR_CODES.PLAN_LIMIT_REACHED, '已达到本月生成次数上限', requestId),
          { status: ERROR_STATUS.PLAN_LIMIT_REACHED, headers: { 'x-request-id': requestId } },
        );
      }
    }
  }

  // ── Template resolution (authenticated users only) ──
  let resolvedOptions = options ?? {};
  if (templateId) {
    if (!userId) {
      return NextResponse.json(
        createError(ERROR_CODES.UNAUTHORIZED, '使用模板需要登录', requestId),
        { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
      );
    }
    let template;
    try {
      template = await getTemplateById(templateId, userId);
    } catch {
      return NextResponse.json(
        createError(ERROR_CODES.SERVICE_UNAVAILABLE, '模板读取失败，请稍后重试', requestId),
        { status: ERROR_STATUS.SERVICE_UNAVAILABLE, headers: { 'x-request-id': requestId } },
      );
    }
    if (!template) {
      return NextResponse.json(
        createError(ERROR_CODES.NOT_FOUND, '模板不存在或无权使用', requestId),
        { status: ERROR_STATUS.NOT_FOUND, headers: { 'x-request-id': requestId } },
      );
    }
    // Merge: explicit request params > template params > system defaults
    resolvedOptions = {
      tone: options?.tone ?? template.tone,
      length: options?.length ?? template.length,
    };
  }

  // ── Content moderation (after rate limit, before AI generation) ──
  const modResult = await checkContent(content);
  if (modResult.blocked) {
    const errResponse = createError(ERROR_CODES.CONTENT_BLOCKED, '内容包含不允许的词汇，请修改后重试', requestId);
    // Fire-and-forget audit — matchedKeywords NOT stored
    void writeAuditLog({
      action: 'CONTENT_BLOCKED',
      userId,
      ipAddress: ip,
      metadata: {
        requestId,
        reason: modResult.reason,
        keywordCount: modResult.matchedKeywords?.length ?? 0,
      },
    });
    return NextResponse.json(errResponse, {
      status: ERROR_STATUS.CONTENT_BLOCKED,
      headers: { 'x-request-id': requestId },
    });
  }

  logger.info('generate start', { requestId, platforms, contentLength: content.length });

  const serviceResult = await generateAll(content, platforms, resolvedOptions);

  // All platforms failed
  if (Object.keys(serviceResult.results).length === 0) {
    const durationMs = Date.now() - start;
    logger.error('all platforms failed', {
      requestId,
      platforms,
      errors: serviceResult.errors,
      durationMs,
    });
    const errResponse = createError(
      ERROR_CODES.AI_PROVIDER_ERROR,
      'All platform generations failed',
      requestId,
      { errors: serviceResult.errors as Record<string, unknown> },
    );
    // Fire-and-forget audit
    void writeAuditLog({
      action: 'GENERATION_FAILED',
      userId,
      ipAddress: ip,
      metadata: {
        requestId,
        errorCode: ERROR_CODES.AI_PROVIDER_ERROR,
        platformCount: platforms.length,
        durationMs,
      },
    });
    return NextResponse.json(errResponse, {
      status: ERROR_STATUS.AI_PROVIDER_ERROR,
      headers: { 'x-request-id': requestId },
    });
  }

  const response: GenerateResponse = {
    generationId: requestId,
    results: serviceResult.results,
    errors: serviceResult.errors,
    durationMs: serviceResult.durationMs,
    model: serviceResult.model,
    partialFailure: serviceResult.partialFailure,
  };

  writeGeneration({
    userId,
    requestId,
    content,
    platforms,
    source: parsed.data.source ?? 'manual',
    result: serviceResult,
  });

  logger.info('generate success', {
    requestId,
    platforms,
    successCount: Object.keys(serviceResult.results).length,
    failCount: Object.keys(serviceResult.errors).length,
    durationMs: serviceResult.durationMs,
    model: serviceResult.model,
  });

  return NextResponse.json(createSuccess(response, requestId), {
    status: 200,
    headers: { 'x-request-id': requestId },
  });
}
