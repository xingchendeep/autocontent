/**
 * Lemon Squeezy SDK adapter — server-side only.
 * Never import this module from client components.
 */
import { createHmac, timingSafeEqual } from 'crypto';

const LEMON_SQUEEZY_API_BASE = 'https://api.lemonsqueezy.com/v1';

// Resolved once at module load; throws at runtime if missing (not build time).
function getApiKey(): string {
  const key = process.env.LEMONSQUEEZY_API_KEY;
  if (!key) throw new Error('LEMONSQUEEZY_API_KEY is not set');
  return key;
}

/**
 * Creates a Lemon Squeezy checkout session and returns the hosted checkout URL.
 *
 * @param variantId  - Lemon Squeezy variant ID for the plan
 * @param userId     - Authenticated user's UUID (stored as custom data)
 * @param successUrl - Redirect URL on successful payment
 * @param cancelUrl  - Redirect URL when the user cancels
 * @returns          Hosted checkout URL
 */
export async function createCheckoutSession(
  variantId: string,
  userId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  const response = await fetch(`${LEMON_SQUEEZY_API_BASE}/checkouts`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_options: {
            success_url: successUrl,
            cancel_url: cancelUrl,
          },
          checkout_data: {
            custom: { user_id: userId },
          },
        },
        relationships: {
          variant: {
            data: { type: 'variants', id: variantId },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Lemon Squeezy API error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as {
    data?: { attributes?: { url?: string } };
  };

  const checkoutUrl = json?.data?.attributes?.url;
  if (!checkoutUrl) {
    throw new Error('Lemon Squeezy response missing checkout URL');
  }

  return checkoutUrl;
}

/**
 * Verifies a Lemon Squeezy webhook signature using HMAC-SHA256.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param rawBody   - Raw request body as a Buffer
 * @param signature - Value of the `X-Signature` header
 * @param secret    - Webhook signing secret
 * @returns         `true` if the signature is valid, `false` otherwise
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean {
  if (!signature) return false;

  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== signatureBuf.length) return false;

    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}
