import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/admin/auth';
import {
  createError,
  createSuccess,
  generateRequestId,
  ERROR_STATUS,
  type ErrorCode,
} from '@/lib/errors';

/**
 * Wraps an admin route handler with standard error handling.
 * Catches AdminAuthError and Zod errors, returns unified ApiError responses.
 */
export async function handleAdminRoute<T>(
  handler: (requestId: string) => Promise<T>,
): Promise<NextResponse> {
  const requestId = generateRequestId();
  try {
    const data = await handler(requestId);
    return NextResponse.json(createSuccess(data, requestId));
  } catch (err) {
    if (err instanceof AdminAuthError) {
      const code = err.code as ErrorCode;
      return NextResponse.json(
        createError(code, err.message, requestId),
        { status: ERROR_STATUS[code] ?? 403 },
      );
    }
    if (err instanceof Error && err.name === 'ZodError') {
      const zodErr = err as unknown as { errors: Array<{ message: string }> };
      return NextResponse.json(
        createError('INVALID_INPUT', zodErr.errors[0]?.message ?? '输入校验失败', requestId),
        { status: 400 },
      );
    }
    const msg = err instanceof Error ? err.message : '服务器内部错误';
    return NextResponse.json(
      createError('INTERNAL_ERROR', msg, requestId),
      { status: 500 },
    );
  }
}
