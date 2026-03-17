import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import {
  createTemplate,
  listTemplates,
} from '@/lib/templates/service';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  tone: z.enum(['professional', 'casual', 'humorous', 'authoritative', 'empathetic']),
  length: z.enum(['short', 'medium', 'long']).optional(),
  custom_instructions: z.string().max(2000).optional(),
  platform_overrides: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '未认证', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, 'Request body must be valid JSON', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '请求参数无效', requestId, {
        details: parsed.error.flatten(),
      }),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const { name, tone, length, custom_instructions, platform_overrides } = parsed.data;
  const template = await createTemplate(session.id, {
    name,
    tone,
    length,
    customInstructions: custom_instructions,
    platformOverrides: platform_overrides,
  });

  return NextResponse.json(createSuccess(template, requestId), {
    status: 201,
    headers: { 'x-request-id': requestId },
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '未认证', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  const teamId = req.nextUrl.searchParams.get('teamId') ?? undefined;
  const templates = await listTemplates(session.id, teamId);

  return NextResponse.json(createSuccess(templates, requestId), {
    status: 200,
    headers: { 'x-request-id': requestId },
  });
}
