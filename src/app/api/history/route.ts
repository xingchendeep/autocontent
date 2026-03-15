import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/auth/server';
import { generateRequestId, createSuccess, createError, ERROR_CODES, ERROR_STATUS } from '@/lib/errors';
import { createSnippet } from '@/lib/snippets';
import type { HistorySummaryItem } from '@/types';

const querySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  platform: z.string().optional(),
  status:   z.enum(['success', 'failed', 'partial']).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  // Parse and validate query params
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, 'Invalid query parameters', requestId, {
        details: parsed.error.flatten() as Record<string, unknown>,
      }),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const { page, limit, platform, status } = parsed.data;
  const from = (page - 1) * limit;
  const to = page * limit - 1;

  const db = await createSupabaseServerClient();
  let query = db
    .from('generations')
    .select(
      'id, input_source, input_content, platforms, platform_count, status, model_name, duration_ms, created_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (platform) query = query.contains('platforms', [platform]);
  if (status)   query = query.eq('status', status);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json(
      createError(ERROR_CODES.INTERNAL_ERROR, 'Failed to fetch history', requestId),
      { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
    );
  }

  const total = count ?? 0;
  const items: HistorySummaryItem[] = (data ?? []).map((row) => ({
    id: row.id as string,
    inputSource: row.input_source as 'manual' | 'extract',
    inputSnippet: createSnippet(row.input_content as string),
    platforms: row.platforms as string[],
    platformCount: row.platform_count as number,
    status: row.status as 'success' | 'partial' | 'failed',
    modelName: row.model_name as string | null,
    durationMs: row.duration_ms as number,
    createdAt: row.created_at as string,
  }));

  return NextResponse.json(
    createSuccess(
      { items, pagination: { page, limit, total, hasMore: page * limit < total } },
      requestId,
    ),
    { status: 200, headers: { 'x-request-id': requestId } },
  );
}
