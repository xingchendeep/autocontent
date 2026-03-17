import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { revokeApiKey } from '@/lib/api-keys';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';

type RouteContext = { params: Promise<{ id: string }> };

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

  try {
    await revokeApiKey(id, session.id);
    return NextResponse.json(createSuccess({ id }, requestId), {
      status: 200,
      headers: { 'x-request-id': requestId },
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND') {
      return NextResponse.json(
        createError(ERROR_CODES.NOT_FOUND, 'API key 不存在或无权操作', requestId),
        { status: ERROR_STATUS.NOT_FOUND, headers: { 'x-request-id': requestId } },
      );
    }
    throw err;
  }
}
