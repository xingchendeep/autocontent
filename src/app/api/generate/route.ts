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
import type { PlatformCode, GenerateResponse } from '@/types';

const platformCodeSchema = z.enum(
  SUPPORTED_PLATFORMS as [PlatformCode, ...PlatformCode[]],
);

const requestSchema = z.object({
  content: z.string().min(1).max(100000),
  platforms: z.array(platformCodeSchema).min(1).max(10),
  source: z.enum(['manual', 'extract']).optional(),
  options: z
    .object({
      tone: z.enum(['professional', 'casual', 'humorous']).optional(),
      length: z.enum(['short', 'medium', 'long']).optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();
  const start = Date.now();

  logger.info('generate request received', { requestId });

  // Resolve session for cloud write (null = anonymous, write will be skipped)
  const session = await getSession();
  const userId = session?.id ?? null;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logger.warn('invalid json body', { requestId });
    const err = createError(
      ERROR_CODES.INVALID_INPUT,
      'Request body must be valid JSON',
      requestId,
    );
    return NextResponse.json(err, {
      status: ERROR_STATUS.INVALID_INPUT,
      headers: { 'x-request-id': requestId },
    });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    // Check for content too long specifically
    const contentIssues = parsed.error.issues.filter(
      (i) => i.path[0] === 'content' && i.code === 'too_big',
    );
    if (contentIssues.length > 0) {
      const err = createError(
        ERROR_CODES.CONTENT_TOO_LONG,
        'Content exceeds the maximum allowed length of 100000 characters',
        requestId,
      );
      return NextResponse.json(err, {
        status: ERROR_STATUS.CONTENT_TOO_LONG,
        headers: { 'x-request-id': requestId },
      });
    }
    // Check for invalid platform codes
    const platformIssues = parsed.error.issues.filter(
      (i) => i.path[0] === 'platforms',
    );
    if (platformIssues.length > 0) {
      const err = createError(
        ERROR_CODES.INVALID_PLATFORM,
        'One or more platform codes are not supported',
        requestId,
        { details: flat },
      );
      return NextResponse.json(err, {
        status: ERROR_STATUS.INVALID_PLATFORM,
        headers: { 'x-request-id': requestId },
      });
    }
    const err = createError(
      ERROR_CODES.INVALID_INPUT,
      'Request body validation failed',
      requestId,
      { details: flat },
    );
    return NextResponse.json(err, {
      status: ERROR_STATUS.INVALID_INPUT,
      headers: { 'x-request-id': requestId },
    });
  }

  const { content, platforms, options } = parsed.data;

  logger.info('generate start', { requestId, platforms, contentLength: content.length });

  const serviceResult = await generateAll(content, platforms, options);

  // All platforms failed
  if (Object.keys(serviceResult.results).length === 0) {
    logger.error('all platforms failed', { requestId, platforms, errors: serviceResult.errors, durationMs: Date.now() - start });
    const err = createError(
      ERROR_CODES.AI_PROVIDER_ERROR,
      'All platform generations failed',
      requestId,
      { errors: serviceResult.errors as Record<string, unknown> },
    );
    return NextResponse.json(err, {
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

  // Fire-and-forget: persist generation record for authenticated users
  writeGeneration({
    userId,
    requestId,
    content,
    platforms,
    source: parsed.data.source ?? 'manual',
    result: serviceResult,
  });

  const success = createSuccess(response, requestId);
  logger.info('generate success', {
    requestId,
    platforms,
    successCount: Object.keys(serviceResult.results).length,
    failCount: Object.keys(serviceResult.errors).length,
    durationMs: serviceResult.durationMs,
    model: serviceResult.model,
  });
  return NextResponse.json(success, {
    status: 200,
    headers: { 'x-request-id': requestId },
  });
}
