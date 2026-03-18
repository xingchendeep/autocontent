import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { listKeywords, addKeyword } from '@/lib/admin/keywords';
import { paginationSchema, addKeywordSchema } from '@/lib/validations/admin';
import { createSuccess, createError, generateRequestId } from '@/lib/errors';

export async function GET(request: NextRequest) {
  return handleAdminRoute(async () => {
    await requireAdmin();
    const sp = request.nextUrl.searchParams;
    const { page, pageSize } = paginationSchema.parse({
      page: sp.get('page') ?? '1',
      pageSize: sp.get('pageSize') ?? '50',
    });
    return listKeywords({
      page,
      pageSize,
      category: sp.get('category') ?? undefined,
    });
  });
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const input = addKeywordSchema.parse(body);
    const result = await addKeyword(input.keyword, input.category, admin.id);
    return NextResponse.json(createSuccess(result, requestId), { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === '关键词已存在') {
      return NextResponse.json(createError('INVALID_INPUT', '关键词已存在', requestId), { status: 400 });
    }
    const msg = err instanceof Error ? err.message : '服务器内部错误';
    return NextResponse.json(createError('INTERNAL_ERROR', msg, requestId), { status: 500 });
  }
}
