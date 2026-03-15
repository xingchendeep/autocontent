import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/billing/lemon-squeezy';
import { createServiceRoleClient } from '@/lib/db/client';
import {
  ERROR_CODES,
  ERROR_STATUS,
  generateRequestId,
  createError,
} from '@/lib/errors';
import { writeAuditLog } from '@/lib/db/audit-logger';

// Subscription statuses that are considered terminal — no further active transitions allowed
const TERMINAL_STATUSES = new Set(['cancelled', 'expired']);

// Valid subscription statuses per schema CHECK constraint
const VALID_STATUSES = new Set(['active', 'cancelled', 'expired', 'past_due', 'trialing', 'paused']);

interface LemonWebhookPayload {
  meta: {
    event_name: string;
    custom_data?: { user_id?: string };
  };
  data: {
    id: string; // event_id (Lemon Squeezy object ID)
    attributes: {
      // subscription fields
      user_id?: number;
      status?: string;
      first_subscription_item?: { subscription_id?: number };
      renews_at?: string | null;
      ends_at?: string | null;
      cancelled?: boolean;
      // order fields
      order_id?: number;
      // shared
      created_at?: string;
      updated_at?: string;
    };
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  // 1. Read raw bytes — must happen before JSON.parse
  const rawBody = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get('x-signature') ?? '';
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? '';

  // 2. Verify signature before any parsing
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    void writeAuditLog({
      action: 'WEBHOOK_SIGNATURE_INVALID',
      userId: null,
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      metadata: { provider: 'lemonsqueezy' },
    });
    return NextResponse.json(
      createError(ERROR_CODES.WEBHOOK_SIGNATURE_INVALID, 'Invalid webhook signature', requestId),
      { status: ERROR_STATUS.WEBHOOK_SIGNATURE_INVALID, headers: { 'x-request-id': requestId } },
    );
  }

  // 3. Parse only after signature is verified
  let event: LemonWebhookPayload;
  try {
    event = JSON.parse(rawBody.toString('utf-8')) as LemonWebhookPayload;
  } catch {
    return NextResponse.json(
      createError(ERROR_CODES.INVALID_INPUT, 'Invalid JSON payload', requestId),
      { status: ERROR_STATUS.INVALID_INPUT, headers: { 'x-request-id': requestId } },
    );
  }

  const eventName = event.meta?.event_name ?? '';
  const eventId = event.data?.id ?? '';
  const db = createServiceRoleClient();

  // 4. Idempotency — attempt to insert webhook_events row
  const { error: insertError } = await db.from('webhook_events').insert({
    provider: 'lemonsqueezy',
    event_id: eventId,
    event_name: eventName,
    payload: event as unknown as Record<string, unknown>,
    processed_at: new Date().toISOString(),
  });

  if (insertError) {
    // Unique constraint violation = duplicate event → idempotent 200
    if (insertError.code === '23505') {
      return NextResponse.json({ processed: true }, { status: 200 });
    }
    return NextResponse.json(
      createError(ERROR_CODES.INTERNAL_ERROR, 'Failed to record webhook event', requestId),
      { status: ERROR_STATUS.INTERNAL_ERROR, headers: { 'x-request-id': requestId } },
    );
  }

  // 5. Handle subscription lifecycle events
  const attrs = event.data?.attributes ?? {};
  const providerSubscriptionId = String(
    attrs.first_subscription_item?.subscription_id ?? event.data?.id ?? '',
  );

  switch (eventName) {
    case 'order_created':
      // Record only — no subscription state change
      void writeAuditLog({
        action: 'ORDER_CREATED',
        userId: event.meta?.custom_data?.user_id ?? null,
        resourceType: 'order',
        resourceId: String(attrs.order_id ?? event.data?.id ?? ''),
      });
      break;

    case 'subscription_created': {
      const userId = event.meta?.custom_data?.user_id;
      if (!userId) break;

      // Resolve plan_id from plans table (default to free as fallback — real plan set via subscription_updated)
      const { data: freePlan } = await db
        .from('plans')
        .select('id')
        .eq('code', 'free')
        .single();

      const { error: upsertErr } = await db.from('subscriptions').upsert(
        {
          user_id: userId,
          plan_id: freePlan?.id,
          provider: 'lemonsqueezy',
          provider_subscription_id: providerSubscriptionId,
          status: 'active',
          current_period_start: attrs.created_at ?? new Date().toISOString(),
          current_period_end: attrs.renews_at ?? attrs.ends_at ?? null,
        },
        { onConflict: 'provider_subscription_id' },
      );

      if (upsertErr) {
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
        metadata: { planCode: 'free', provider: 'lemonsqueezy' },
      });
      break;
    }

    case 'subscription_updated': {
      // Fetch current subscription to check terminal state
      const { data: existing } = await db
        .from('subscriptions')
        .select('id, status')
        .eq('provider_subscription_id', providerSubscriptionId)
        .maybeSingle();

      if (!existing) break;

      // Do not allow expired → active transition
      const newStatus = attrs.status ?? '';
      if (existing.status === 'expired' && newStatus === 'active') break;

      // Skip if already in terminal state and incoming is same terminal
      if (TERMINAL_STATUSES.has(existing.status) && existing.status === newStatus) break;

      if (!VALID_STATUSES.has(newStatus)) break;

      const { error: updateErr } = await db
        .from('subscriptions')
        .update({
          status: newStatus,
          current_period_end: attrs.renews_at ?? attrs.ends_at ?? null,
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
        userId: event.meta?.custom_data?.user_id ?? null,
        resourceType: 'subscription',
        resourceId: providerSubscriptionId,
        metadata: { previousStatus: existing.status, newStatus },
      });
      break;
    }

    case 'subscription_cancelled': {
      const { data: existing } = await db
        .from('subscriptions')
        .select('id, status')
        .eq('provider_subscription_id', providerSubscriptionId)
        .maybeSingle();

      if (!existing) break;
      // Already in terminal state with same event — no-op
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
        userId: event.meta?.custom_data?.user_id ?? null,
        resourceType: 'subscription',
        resourceId: providerSubscriptionId,
      });
      break;
    }

    case 'subscription_expired': {
      const { data: existing } = await db
        .from('subscriptions')
        .select('id, status')
        .eq('provider_subscription_id', providerSubscriptionId)
        .maybeSingle();

      if (!existing) break;
      // Already expired — no-op
      if (existing.status === 'expired') break;

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

    default:
      // Unknown event type — recorded but no action
      break;
  }

  return NextResponse.json({ processed: true }, { status: 200 });
}
