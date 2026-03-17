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
import { getPlanCapability } from '@/lib/billing/plan-capability';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkContent } from '@/lib/moderation';
import { verifyApiKey, getApiKeyId, recordApiKeyUsage } from '@/lib/api-keys';
import { writeGeneration } from '@/lib/db/generation-writer';
import type { PlatformCode, GenerateResponse } from '@/types';

const platformCodeSchema = z.enum(
  SUPPORTED_PLATFORMS as [PlatformCode, ...PlatformCode[]],
);

const requestSchema = z.object({
  content: z.string().min(1).max(100000),
  platforms: z.array(platformCodeSchema).min(1).max(10),
  options: z
    .object({
      tone: z.enum(['professional', 'casual', 'humorous', 'authoritative', 'empathetic']).optional(),
      length: z.enum(['short', 'medium', 'long']).optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  // ── API Key authentication ──
  const authHeader = req.headers.get('authorization') ?? '';
  const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!rawKey) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '缺少 Authorization 请求头', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  const userId = await verifyApiKey(rawKey);
  if (!userId) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, 'API key 无效或已撤销', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  // ── Per-key rate limit: 10 req/min ──
  const keyId = await getApiKeyId(rawKey);
  if (keyId) {
    const rl = await checkRateLimit(`ratelimit:apikey:${keyId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        createError(ERROR_CODES.RATE_LIMITED, 'API key 请求过于频繁，每分钟最多 10 次', requestId, {
          retryAfter: rl.resetAt,
        }),
        { status: ERROR_STATUS.RATE_LIMITED, headers: { 'x-request-id': requestId } },
      );
    }
  }

  // ── Parse & validate body ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, 'Request body must be valid JSON', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const hasContentTooLong = parsed.error.issues.some(
      (i) => i.path[0] === 'content' && i.code === 'too_big',
    );
    if (hasContentTooLong) {
      return NextResponse.json(
        createError(ERROR_CODES.CONTENT_TOO_LONG, 'Content exceeds maximum allowed length', requestId),
        { status: ERROR_STATUS.CONTENT_TOO_LONG, headers: { 'x-request-id': requestId } },
      );
    }
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, 'Request body validation failed', requestId, { details: flat }),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const { content, platforms, options } = parsed.data;

  // ── Plan capability check ──
  try {
    const capability = await getPlanCapability(userId);
    if (capability.maxPlatforms !== null && platforms.length > capability.maxPlatforms) {
      return NextResponse.json(
        createError(ERROR_CODES.PLAN_LIMIT_REACHED, '已超出套餐平台数量限制', requestId),
        { status: ERROR_STATUS.PLAN_LIMIT_REACHED, headers: { 'x-request-id': requestId } },
      );
    }
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.SERVICE_UNAVAILABLE, '无法获取套餐信息', requestId),
      { status: ERROR_STATUS.SERVICE_UNAVAILABLE, headers: { 'x-request-id': requestId } },
    );
  }

  // ── Content moderation ──
  const modResult = checkContent(content);
  if (modResult.blocked) {
    return NextResponse.json(
      createError(ERROR_CODES.CONTENT_BLOCKED, '内容包含不允许的词汇，请修改后重试', requestId),
      { status: ERROR_STATUS.CONTENT_BLOCKED, headers: { 'x-request-id': requestId } },
    );
  }

  logger.info('v1/generate start', { requestId, userId, platforms, contentLength: content.length });

  const serviceResult = await generateAll(content, platforms, options ?? {});

  if (Object.keys(serviceResult.results).length === 0) {
    return NextResponse.json(
      createError(ERROR_CODES.AI_PROVIDER_ERROR, 'All platform generations failed', requestId, {
        errors: serviceResult.errors as Record<string, unknown>,
      }),
      { status: ERROR_STATUS.AI_PROVIDER_ERROR, headers: { 'x-request-id': requestId } },
    );
  }

  // ── Record key usage (fire-and-forget) ──
  if (keyId) void recordApiKeyUsage(keyId);

  // ── Save to generation history ──
  writeGeneration({
    userId,
    requestId,
    content,
    platforms,
    source: 'manual',
    result: serviceResult,
  });

  const response: GenerateResponse = {
    generationId: requestId,
    results: serviceResult.results,
    errors: serviceResult.errors,
    durationMs: serviceResult.durationMs,
    model: serviceResult.model,
    partialFailure: serviceResult.partialFailure,
  };

  logger.info('v1/generate success', {
    requestId,
    userId,
    successCount: Object.keys(serviceResult.results).length,
    durationMs: serviceResult.durationMs,
  });

  return NextResponse.json(createSuccess(response, requestId), {
    status: 200,
    headers: { 'x-request-id': requestId },
  });
}
