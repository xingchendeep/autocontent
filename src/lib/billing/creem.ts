/**
 * Creem.io SDK adapter — server-side only.
 * Never import this module from client components.
 */
import { createHmac, timingSafeEqual } from 'crypto';

const CREEM_API_BASE =
  process.env.NODE_ENV === 'production'
    ? 'https://api.creem.io/v1'
    : 'https://test-api.creem.io/v1';

function getApiKey(): string {
  const key = process.env.CREEM_API_KEY;
  if (!key) throw new Error('CREEM_API_KEY is not set');
  return key;
}

/**
 * Creates a Creem checkout session and returns the hosted checkout URL.
 *
 * @param productId  - Creem product ID (e.g. prod_abc123)
 * @param userId     - Authenticated user's UUID (stored as metadata)
 * @param successUrl - Redirect URL on successful payment
 * @returns          Hosted checkout URL
 */
export async function createCheckoutSession(
  productId: string,
  userId: string,
  successUrl: string,
): Promise<string> {
  const response = await fetch(`${CREEM_API_BASE}/checkouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
    },
    body: JSON.stringify({
      product_id: productId,
      success_url: successUrl,
      metadata: { userId },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Creem API error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as { checkout_url?: string };
  const checkoutUrl = json?.checkout_url;
  if (!checkoutUrl) {
    throw new Error('Creem response missing checkout_url');
  }

  return checkoutUrl;
}

/**
 * Verifies a Creem webhook signature using HMAC-SHA256.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param rawBody   - Raw request body as a Buffer
 * @param signature - Value of the `creem-signature` header
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
