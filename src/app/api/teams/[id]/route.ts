import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getMemberRole, getTeamMembers } from '@/lib/teams';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const requestId = generateRequestId();

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '未认证', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  const { id: teamId } = await ctx.params;

  // Verify the user is a member of this team
  const role = await getMemberRole(teamId, session.id);
  if (!role) {
    return NextResponse.json(
      createError(ERROR_CODES.FORBIDDEN, '无权访问该团队', requestId),
      { status: ERROR_STATUS.FORBIDDEN, headers: { 'x-request-id': requestId } },
    );
  }

  const members = await getTeamMembers(teamId);

  return NextResponse.json(
    createSuccess({ members }, requestId),
    { status: 200, headers: { 'x-request-id': requestId } },
  );
}
