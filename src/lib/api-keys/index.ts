import crypto from 'crypto';
import { createServiceRoleClient } from '@/lib/db/client';

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** SHA-256 hex digest of a raw key string. */
function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Generates a new API key, stores its hash, and returns the plaintext key once.
 * Format: acp_ + 32 base64url chars (total 36 chars).
 */
export async function createApiKey(
  userId: string,
  name: string,
): Promise<{ id: string; name: string; key: string; prefix: string; createdAt: string }> {
  const rawKey = `acp_${crypto.randomBytes(24).toString('base64url').slice(0, 32)}`;
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 8); // "acp_XXXX"

  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('api_keys')
    .insert({ user_id: userId, name, key_hash: keyHash, key_prefix: keyPrefix })
    .select('id, name, key_prefix, created_at')
    .single();

  if (error || !data) {
    throw new Error(`createApiKey: insert failed: ${error?.message}`);
  }

  return {
    id: data.id as string,
    name: data.name as string,
    key: rawKey,
    prefix: data.key_prefix as string,
    createdAt: data.created_at as string,
  };
}

/**
 * Lists all API keys for a user — never returns the plaintext key.
 */
export async function listApiKeys(userId: string): Promise<ApiKeyItem[]> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('api_keys')
    .select('id, name, key_prefix, created_at, last_used_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`listApiKeys: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    prefix: row.key_prefix as string,
    createdAt: row.created_at as string,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
  }));
}

/**
 * Revokes an API key by setting is_active = false.
 * Validates ownership — throws NOT_FOUND if key doesn't belong to user.
 */
export async function revokeApiKey(id: string, userId: string): Promise<void> {
  const db = createServiceRoleClient();

  const { data, error } = await db
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`revokeApiKey: ${error.message}`);
  if (!data) throw Object.assign(new Error('API key not found'), { code: 'NOT_FOUND' });
}

/**
 * Verifies a raw API key. Returns the owning userId if valid and active, null otherwise.
 */
export async function verifyApiKey(rawKey: string): Promise<string | null> {
  const db = createServiceRoleClient();
  const keyHash = hashKey(rawKey);

  const { data, error } = await db
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data.user_id as string;
}

/**
 * Updates last_used_at for the given key id.
 */
export async function recordApiKeyUsage(id: string): Promise<void> {
  const db = createServiceRoleClient();
  await db
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', id);
}

/**
 * Returns the key id for a raw key (needed to call recordApiKeyUsage after verify).
 */
export async function getApiKeyId(rawKey: string): Promise<string | null> {
  const db = createServiceRoleClient();
  const keyHash = hashKey(rawKey);

  const { data } = await db
    .from('api_keys')
    .select('id')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .maybeSingle();

  return data ? (data.id as string) : null;
}
