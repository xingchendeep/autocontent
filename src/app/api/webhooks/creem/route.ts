import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/billing/creem';
import { createServiceRoleClient } from '@/lib/db/client';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createError,
} from '@/lib/errors';
import { writeAuditLog } from '@/lib/db/audit-logger';

const TERMINAL_STATUSES = new Set(['cancelled', 'expired']);
const VALID_STATUSES = new Set(['active', 'cancelled', 'expired', 'past_due', 'trialing', 'paused']);

// Creem uses "canceled" (single l) — normalize to our DB schema "cancelled"
function normalizeStatus(status: string): string {
  return status === 'canceled' ? 'cancelled' : status;
}

interface CreemWebhookPayload {
  eventType: string;
  object: {
    id: string;
    status?: string;
    product?: { id?: string };
    customer?: { id?: string };
    current_period_start_date?: string | null;
    current_period_end_date?: string | null;
    canceled_at?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  metadata?: { userId?: string };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  const rawBody = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get('creem-signature') ?? '';
  const secret = process.env.CREEM_WEBHOOK_SECRET ?? '';

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    void writeAuditLog({
      action: 'WEBHOOK_SIGNATURE_INVALID',
      userId: null,
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      metadata: { provider: 'creem' },
    });
    return NextResponse.json(
      createError(ERROR_CODES.WEBHOOK_SIGNATURE_INVALID, 'Invalid webhook signature', requestId),
      { status: ERROR_STATUS.WEBHOOK_SIGNATURE_INVALID, headers: { 'x-request-id': requestId } },
    );
  }

  let event: CreemWebhookPayload;
  try {
    event = JSON.parse(rawBody.toString('utf-8')) as CreemWebhookPayload;
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, 'Invalid JSON payload', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const eventType = event.eventType ?? '';
  const eventId = event.object?.id ?? '';
  const db = createServiceRoleClient();

  // Idempotency
  const { error: insertError } = await db.from('webhook_events').insert({
    provider: 'creem',
    event_id: eventId,
    event_name: eventType,
    payload: event as unknown as Record<string, unknown>,
    processed_at: new Date().toISOString(),
  });

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ processed: true }, { status: 200 });
    }
    return NextResponse.json(
      createError(ERROR_CODES.INTERNAL_ERROR, 'Failed to record webhook event', requestId),
      { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
    );
  }

  const obj = event.object;
  const providerSubscriptionId = obj?.id ?? '';
  const userId = event.metadata?.userId ?? null;

  switch (eventType) {
    case 'checkout.completed': {
      void writeAuditLog({
        action: 'ORDER_CREATED',
        userId,
        resourceType: 'order',
        resourceId: providerSubscriptionId,
        metadata: { provider: 'creem' },
      });
      break;
    }

    case 'subscription.active': {
      if (!userId) break;

      const { data: freePlan } = await db
        .from('plans')
        .select('id')
        .eq('code', 'free')
        .single();

      const { data: existingSub } = await db
        .from('subscriptions')
        .select('id')
        .eq('provider_subscription_id', providerSubscriptionId)
        .maybeSingle();

      let subError: { code: string; message: string } | null = null;
      if (existingSub) {
        const { error } = await db
          .from('subscriptions')
          .update({
            plan_id: freePlan?.id,
            status: 'active',
            current_period_start: obj.current_period_start_date ?? new Date().toISOString(),
            current_period_end: obj.current_period_end_date ?? null,
          })
          .eq('id', existingSub.id);
        subError = error;
      } else {
        const { error } = await db.from('subscriptions').insert({
          user_id: userId,
          plan_id: freePlan?.id,
          provider: 'creem',
          provider_subscription_id: providerSubscriptionId,
          status: 'active',
          current_period_start: obj.current_period_start_date ?? new Date().toISOString(),
          current_period_end: obj.current_period_end_date ?? null,
        });
        subError = error;
      }

      if (subError) {
        return NextResponse.json(
          createError(ERROR_CODES.INTERNAL_ERROR, 'Failed to create subscription', requestId),
          { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
        );
      }
      void writeAuditLog({
        action: 'SUBSCRIPTION_CREATED',
        userId,
        resourceType: 'subscription',
        resourceId: providerSubscriptionId,
        metadata: { provider: 'creem' },
      });
      break;
    }

    case 'subscription.update':
    case 'subscription.paid': {
      const { data: existing } = await db
        .from('subscriptions')
        .select('id, status')
        .eq('provider_subscription_id', providerSubscriptionId)
        .maybeSingle();

      if (!existing) break;

      const rawStatus = obj.status ?? '';
      const newStatus = normalizeStatus(rawStatus);

      if (existing.status === 'expired' && newStatus === 'active') break;
      if (TERMINAL_STATUSES.has(existing.status) && existing.status === newStatus) break;
      if (!VALID_STATUSES.has(newStatus)) break;

      const { error: updateErr } = await db
        .from('subscriptions')
        .update({
          status: newStatus,
          current_period_end: obj.current_period_end_date ?? null,
        })
        .eq('id', existing.id);

      if (updateErr) {
        return NextResponse.json(
          createError(ERROR_CODES.INTERNAL_ERROR, 'Failed to update subscription', requestId),
          { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
        );
      }
      void writeAuditLog({
        action: 'SUBSCRIPTION_UPDATED',
        userId,
        resourceType: 'subscription',
        resourceId: providerSubscriptionId,
        metadata: { previousStatus: existing.status, newStatus },
      });
      break;
    }

    case 'subscription.canceled':
    case 'subscription.scheduled_cancel': {
      const { data: existing } = await db
        .from('subscriptions')
        .select('id, status')
        .eq('provider_subscription_id', providerSubscriptionId)
        .maybeSingle();

      if (!existing) break;
      if (TERMINAL_STATUSES.has(existing.status) && existing.status === 'cancelled') break;

      const { error: cancelErr } = await db
        .from('subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (cancelErr) {
        return NextResponse.json(
          createError(ERROR_CODES.INTERNAL_ERROR, 'Failed to cancel subscription', requestId),
          { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
        );
      }
      void writeAuditLog({
        action: 'SUBSCRIPTION_CANCELLED',
        userId,
        resourceType: 'subscription',
        resourceId: providerSubscriptionId,
      });
      break;
    }

    case 'subscription.expired': {
      const { data: existing } = await db
        .from('subscriptions')
        .select('id, status')
        .eq('provider_subscription_id', providerSubscriptionId)
        .maybeSingle();

      if (!existing || existing.status === 'expired') break;

      const { error: expireErr } = await db
        .from('subscriptions')
        .update({ status: 'expired' })
        .eq('id', existing.id);

      if (expireErr) {
        return NextResponse.json(
          createError(ERROR_CODES.INTERNAL_ERROR, 'Failed to expire subscription', requestId),
          { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
        );
      }
      break;
    }

    case 'subscription.past_due': {
      const { data: existing } = await db
        .from('subscriptions')
        .select('id, status')
        .eq('provider_subscription_id', providerSubscriptionId)
        .maybeSingle();

      if (!existing) break;

      await db
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('id', existing.id);
      break;
    }

    case 'subscription.paused': {
      const { data: existing } = await db
        .from('subscriptions')
        .select('id, status')
        .eq('provider_subscription_id', providerSubscriptionId)
        .maybeSingle();

      if (!existing) break;

      await db
        .from('subscriptions')
        .update({ status: 'paused' })
        .eq('id', existing.id);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ processed: true }, { status: 200 });
}
