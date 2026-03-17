import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';
import { saveScript, listScripts } from '@/lib/scripts';
import { createSnippet } from '@/lib/snippets';
import type { SavedScriptItem } from '@/types';

const saveSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(100000),
  source: z.enum(['manual', 'extract']).optional(),
  sourceUrl: z.string().url().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '请先登录', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '请求体格式错误', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '参数校验失败', requestId, {
        details: parsed.error.flatten() as unknown as Record<string, unknown>,
      }),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  try {
    const script = await saveScript({
      userId: session.id,
      title: parsed.data.title,
      content: parsed.data.content,
      source: parsed.data.source,
      sourceUrl: parsed.data.sourceUrl,
    });

    return NextResponse.json(
      createSuccess({ id: script.id, title: script.title, createdAt: script.createdAt }, requestId),
      { status: 201, headers: { 'x-request-id': requestId } },
    );
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INTERNAL_ERROR, '保存脚本失败', requestId),
      { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
    );
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '请先登录', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '参数校验失败', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  try {
    const { items, total } = await listScripts(session.id, parsed.data);
    const { page, limit } = parsed.data;

    const summaries: SavedScriptItem[] = items.map((s) => ({
      id: s.id,
      title: s.title,
      contentSnippet: createSnippet(s.content),
      source: s.source,
      sourceUrl: s.sourceUrl,
      createdAt: s.createdAt,
    }));

    return NextResponse.json(
      createSuccess(
        { items: summaries, pagination: { page, limit, total, hasMore: page * limit < total } },
        requestId,
      ),
      { status: 200, headers: { 'x-request-id': requestId } },
    );
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INTERNAL_ERROR, '获取脚本列表失败', requestId),
      { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
    );
  }
}
