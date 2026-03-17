import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { removeMember } from '@/lib/teams';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const requestId = generateRequestId();

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '未认证', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  const { id: teamId, userId: targetUserId } = await ctx.params;

  try {
    await removeMember(teamId, session.id, targetUserId);
    return NextResponse.json(createSuccess({ userId: targetUserId }, requestId), {
      status: 200,
      headers: { 'x-request-id': requestId },
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'FORBIDDEN') {
      return NextResponse.json(
        createError(ERROR_CODES.FORBIDDEN, (err as Error).message, requestId),
        { status: ERROR_STATUS.FORBIDDEN, headers: { 'x-request-id': requestId } },
      );
    }
    if (code === 'NOT_FOUND') {
      return NextResponse.json(
        createError(ERROR_CODES.NOT_FOUND, (err as Error).message, requestId),
        { status: ERROR_STATUS.NOT_FOUND, headers: { 'x-request-id': requestId } },
      );
    }
    throw err;
  }
}
