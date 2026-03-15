import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifyWebhookSignature } from '@/lib/billing/lemon-squeezy'

const SECRET = 'test-webhook-secret'

function sign(payload: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(Buffer.from(payload)).digest('hex')
}

describe('verifyWebhookSignature', () => {
  it('returns true for a valid signature', () => {
    const payload = '{"event":"subscription_created"}'
    const sig = sign(payload)
    expect(verifyWebhookSignature(Buffer.from(payload), sig, SECRET)).toBe(true)
  })

  it('returns false for an empty signature', () => {
    const payload = '{"event":"subscription_created"}'
    expect(verifyWebhookSignature(Buffer.from(payload), '', SECRET)).toBe(false)
  })

  it('returns false when payload is tampered', () => {
    const original = '{"event":"subscription_created"}'
    const tampered = '{"event":"subscription_cancelled"}'
    const sig = sign(original)
    expect(verifyWebhookSignature(Buffer.from(tampered), sig, SECRET)).toBe(false)
  })

  it('returns false when secret is wrong', () => {
    const payload = '{"event":"subscription_created"}'
    const sig = sign(payload, 'wrong-secret')
    expect(verifyWebhookSignature(Buffer.from(payload), sig, SECRET)).toBe(false)
  })

  it('returns false for a completely invalid signature string', () => {
    const payload = '{"event":"subscription_created"}'
    expect(verifyWebhookSignature(Buffer.from(payload), 'not-a-valid-hex-sig', SECRET)).toBe(false)
  })
})
