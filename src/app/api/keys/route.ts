import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { getPlanCapability } from '@/lib/billing/plan-capability';
import { createApiKey, listApiKeys } from '@/lib/api-keys';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';

const createSchema = z.object({
  name: z.string().min(1).max(100),
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

  const capability = await getPlanCapability(session.id);
  if (!capability.canUseApi) {
    return NextResponse.json(
      createError(ERROR_CODES.PLAN_LIMIT_REACHED, '当前套餐不支持 API 访问', requestId),
      { status: ERROR_STATUS.PLAN_LIMIT_REACHED, headers: { 'x-request-id': requestId } },
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

  const result = await createApiKey(session.id, parsed.data.name);

  return NextResponse.json(createSuccess(result, requestId), {
    status: 201,
    headers: { 'x-request-id': requestId },
  });
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '未认证', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  const keys = await listApiKeys(session.id);

  return NextResponse.json(createSuccess({ items: keys }, requestId), {
    status: 200,
    headers: { 'x-request-id': requestId },
  });
}
