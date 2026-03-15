import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { createCheckoutSession } from '@/lib/billing/lemon-squeezy';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createSuccess,
  createError,
} from '@/lib/errors';
import { writeAuditLog } from '@/lib/db/audit-logger';
import type { CheckoutResponseData } from '@/types';

const VARIANT_MAP: Record<string, string | undefined> = {
  creator:    process.env.LEMON_VARIANT_CREATOR,
  studio:     process.env.LEMON_VARIANT_STUDIO,
  enterprise: process.env.LEMON_VARIANT_ENTERPRISE,
};

const requestSchema = z.object({
  planCode:   z.enum(['creator', 'studio', 'enterprise']),
  successUrl: z.string().url(),
  cancelUrl:  z.string().url(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  // Auth check
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      createError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', requestId),
      { status: ERROR_STATUS.UNAUTHORIZED, headers: { 'x-request-id': requestId } },
    );
  }

  // Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, 'Request body must be valid JSON', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, 'Invalid request body', requestId, {
        details: parsed.error.flatten() as Record<string, unknown>,
      }),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const { planCode, successUrl, cancelUrl } = parsed.data;

  // Resolve variant ID from env
  const variantId = VARIANT_MAP[planCode];
  if (!variantId) {
    return NextResponse.json(
      createError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        `Variant ID for plan "${planCode}" is not configured`,
        requestId,
      ),
      { status: ERROR_STATUS.SERVICE_UNAVAILABLE, headers: { 'x-request-id': requestId } },
    );
  }

  // Call Lemon Squeezy
  let checkoutUrl: string;
  try {
    checkoutUrl = await createCheckoutSession(variantId, session.id, successUrl, cancelUrl);
  } catch {
    const errResponse = createError(
      ERROR_CODES.SERVICE_UNAVAILABLE,
      'Failed to create checkout session',
      requestId,
    );
    void writeAuditLog({
      action: 'CHECKOUT_FAILED',
      userId: session.id,
      metadata: { planCode, requestId },
    });
    return NextResponse.json(errResponse, {
      status: ERROR_STATUS.SERVICE_UNAVAILABLE,
      headers: { 'x-request-id': requestId },
    });
  }

  const data: CheckoutResponseData = { checkoutUrl, provider: 'lemonsqueezy' };
  return NextResponse.json(
    createSuccess(data, requestId),
    { status: 200, headers: { 'x-request-id': requestId } },
  );
}
