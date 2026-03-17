import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { updateTemplate, deleteTemplate } from '@/lib/templates/service';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  tone: z.enum(['professional', 'casual', 'humorous', 'authoritative', 'empathetic']).optional(),
  length: z.enum(['short', 'medium', 'long']).optional(),
  custom_instructions: z.string().max(2000).optional(),
  platform_overrides: z.record(z.unknown()).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const requestId = generateRequestId();
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '未认证', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, 'Request body must be valid JSON', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '请求参数无效', requestId, {
        details: parsed.error.flatten(),
      }),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const { name, tone, length, custom_instructions, platform_overrides } = parsed.data;
  const updated = await updateTemplate(id, session.id, {
    name,
    tone,
    length,
    customInstructions: custom_instructions,
    platformOverrides: platform_overrides,
  });

  if (!updated) {
    return NextResponse.json(
      createError(ERROR_CODES.NOT_FOUND, '模板不存在或无权操作', requestId),
      { status: ERROR_STATUS.NOT_FOUND, headers: { 'x-request-id': requestId } },
    );
  }

  return NextResponse.json(createSuccess(updated, requestId), {
    status: 200,
    headers: { 'x-request-id': requestId },
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const requestId = generateRequestId();
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '未认证', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  const { id } = await ctx.params;
  const deleted = await deleteTemplate(id, session.id);

  if (!deleted) {
    return NextResponse.json(
      createError(ERROR_CODES.NOT_FOUND, '模板不存在或无权操作', requestId),
      { status: ERROR_STATUS.NOT_FOUND, headers: { 'x-request-id': requestId } },
    );
  }

  return NextResponse.json(createSuccess({ id }, requestId), {
    status: 200,
    headers: { 'x-request-id': requestId },
  });
}
