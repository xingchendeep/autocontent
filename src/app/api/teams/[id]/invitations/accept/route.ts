import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { acceptInvitation } from '@/lib/teams';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';

const acceptSchema = z.object({
  token: z.string().min(1),
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

  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '请求参数无效', requestId, {
        details: parsed.error.flatten(),
      }),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  try {
    const member = await acceptInvitation(parsed.data.token, session.id);
    return NextResponse.json(createSuccess(member, requestId), {
      status: 200,
      headers: { 'x-request-id': requestId },
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND' || code === 'INVITATION_EXPIRED' || code === 'INVITATION_USED' || code === 'ALREADY_MEMBER') {
      return NextResponse.json(
        createError(ERROR_CODES.INVALID_INPUT, (err as Error).message, requestId),
        { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
      );
    }
    throw err;
  }
}
