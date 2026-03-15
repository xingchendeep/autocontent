import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/auth/server';
import { generateRequestId, createSuccess, createError, ERROR_CODES, ERROR_STATUS } from '@/lib/errors';
import type { HistoryDetailResponse } from '@/types';

const idSchema = z.string().uuid();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = generateRequestId();
  const { id } = await params;

  // Validate UUID format
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, 'Invalid generation ID format', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  // Verify authentication
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  // Query with RLS — only returns records belonging to the authenticated user
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from('generations')
    .select('id, input_source, input_content, platforms, platform_count, result_json, status, model_name, duration_ms, created_at')
    .eq('id', parsed.data)
    .single();

  if (error || !data) {
    return NextResponse.json(
      createError(ERROR_CODES.NOT_FOUND, 'Generation not found', requestId),
      { status: ERROR_STATUS.NOT_FOUND, headers: { 'x-request-id': requestId } },
    );
  }

  const detail: HistoryDetailResponse = {
    id: data.id as string,
    inputSource: data.input_source as 'manual' | 'extract',
    inputContent: (data.input_content as string) ?? '',
    platforms: data.platforms as string[],
    platformCount: data.platform_count as number,
    resultJson: data.result_json as Record<string, unknown>,
    status: data.status as 'success' | 'partial' | 'failed',
    modelName: data.model_name as string | null,
    durationMs: data.duration_ms as number,
    createdAt: data.created_at as string,
  };

  return NextResponse.json(
    createSuccess(detail, requestId),
    { status: 200, headers: { 'x-request-id': requestId } },
  );
}
