import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { getMemberRole, inviteToTeam } from '@/lib/teams';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const requestId = generateRequestId();

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '未认证', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  const { id: teamId } = await ctx.params;

  // Only owner or admin can invite
  const role = await getMemberRole(teamId, session.id);
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json(
      createError(ERROR_CODES.FORBIDDEN, '无操作权限，仅 owner 或 admin 可发送邀请', requestId),
      { status: ERROR_STATUS.FORBIDDEN, headers: { 'x-request-id': requestId } },
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

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '请求参数无效', requestId, {
        details: parsed.error.flatten(),
      }),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const invitation = await inviteToTeam(teamId, session.id, parsed.data.email, parsed.data.role);

  return NextResponse.json(
    createSuccess(
      { invitationId: invitation.id, expiresAt: invitation.expiresAt, emailSent: invitation.emailSent },
      requestId,
    ),
    { status: 201, headers: { 'x-request-id': requestId } },
  );
}
