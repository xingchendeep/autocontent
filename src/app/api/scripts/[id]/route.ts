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
import { deleteScript, getScriptById } from '@/lib/scripts';
import type { SavedScriptDetail } from '@/types';

const idSchema = z.string().uuid();

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = generateRequestId();
  const { id } = await params;

  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '无效的脚本 ID', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '请先登录', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  try {
    await deleteScript(parsed.data, session.id);
    return NextResponse.json(
      createSuccess({ deleted: true }, requestId),
      { status: 200, headers: { 'x-request-id': requestId } },
    );
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INTERNAL_ERROR, '删除脚本失败', requestId),
      { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
    );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = generateRequestId();
  const { id } = await params;

  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, '无效的脚本 ID', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, '请先登录', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  try {
    const script = await getScriptById(parsed.data, session.id);
    if (!script) {
      return NextResponse.json(
        createError(ERROR_CODES.NOT_FOUND, '脚本不存在', requestId),
        { status: ERROR_STATUS.NOT_FOUND, headers: { 'x-request-id': requestId } },
      );
    }

    const detail: SavedScriptDetail = {
      id: script.id,
      title: script.title,
      content: script.content,
      source: script.source,
      sourceUrl: script.sourceUrl,
      createdAt: script.createdAt,
      updatedAt: script.updatedAt,
    };

    return NextResponse.json(
      createSuccess(detail, requestId),
      { status: 200, headers: { 'x-request-id': requestId } },
    );
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INTERNAL_ERROR, '获取脚本失败', requestId),
      { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
    );
  }
}
