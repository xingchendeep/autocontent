import type { ApiSuccess, ApiError } from '@/types';

// --- Error codes (UPPER_SNAKE_CASE) ---

export const ERROR_CODES = {
  INVALID_INPUT:              'INVALID_INPUT',
  INVALID_PLATFORM:           'INVALID_PLATFORM',
  CONTENT_TOO_LONG:           'CONTENT_TOO_LONG',
  UNAUTHORIZED:               'UNAUTHORIZED',
  PLAN_LIMIT_REACHED:         'PLAN_LIMIT_REACHED',
  CONTENT_BLOCKED:            'CONTENT_BLOCKED',
  RATE_LIMITED:               'RATE_LIMITED',
  AI_PROVIDER_ERROR:          'AI_PROVIDER_ERROR',
  SERVICE_UNAVAILABLE:        'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR:             'INTERNAL_ERROR',
  WEBHOOK_SIGNATURE_INVALID:  'WEBHOOK_SIGNATURE_INVALID',
  NOT_FOUND:                  'NOT_FOUND',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

// --- HTTP status map (per API_SPEC.md section 4) ---

export const ERROR_STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT:              400,
  INVALID_PLATFORM:           400,
  CONTENT_TOO_LONG:           400,
  UNAUTHORIZED:               401,
  WEBHOOK_SIGNATURE_INVALID:  401,
  PLAN_LIMIT_REACHED:         402,
  CONTENT_BLOCKED:            422,
  RATE_LIMITED:               429,
  AI_PROVIDER_ERROR:          500,
  SERVICE_UNAVAILABLE:        503,
  INTERNAL_ERROR:             500,
  NOT_FOUND:                  404,
};

// --- Factory functions ---

/** Generates a collision-resistant request ID with "req_" prefix. */
export function generateRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function createSuccess<T>(data: T, requestId: string): ApiSuccess<T> {
  return {
    success: true,
    data,
    requestId,
    timestamp: new Date().toISOString(),
  };
}

export function createError(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): ApiError {
  return {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
    requestId,
    timestamp: new Date().toISOString(),
  };
}
