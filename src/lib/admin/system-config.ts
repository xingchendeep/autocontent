import { createServiceRoleClient } from '@/lib/db/client';
import { writeAuditLog } from '@/lib/db/audit-logger';
import { logger } from '@/lib/logger';

export interface SystemConfigItem {
  key: string;
  value: string;
  valueType: string;
  updatedBy: string | null;
  updatedAt: string;
}

const SYSTEM_PREFIX = 'system:';

export async function listSystemConfigs(): Promise<SystemConfigItem[]> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('site_settings')
    .select('key, value, value_type, updated_by, updated_at')
    .like('key', 'system:%')
    .order('key');

  if (error || !data) return [];

  return data.map((r) => ({
    key: r.key.replace(SYSTEM_PREFIX, ''),
    value: r.value,
    valueType: r.value_type,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  }));
}

export async function updateSystemConfigs(
  configs: Array<{ key: string; value: string }>,
  adminId: string,
): Promise<SystemConfigItem[]> {
  const db = createServiceRoleClient();

  for (const c of configs) {
    const fullKey = c.key.startsWith(SYSTEM_PREFIX) ? c.key : `${SYSTEM_PREFIX}${c.key}`;

    // Read old value + type for validation and audit
    const { data: old } = await db
      .from('site_settings')
      .select('value, value_type')
      .eq('key', fullKey)
      .single();

    // Validate value against type
    if (old?.value_type === 'integer' && !/^\d+$/.test(c.value)) {
      throw new Error(`配置项 ${c.key} 的值必须为整数`);
    }
    if (old?.value_type === 'boolean' && c.value !== 'true' && c.value !== 'false') {
      throw new Error(`配置项 ${c.key} 的值必须为 true 或 false`);
    }

    const { error } = await db
      .from('site_settings')
      .update({ value: c.value, updated_by: adminId, updated_at: new Date().toISOString() })
      .eq('key', fullKey);

    if (error) {
      logger.error('updateSystemConfigs failed', { key: fullKey, error: error.message });
      continue;
    }

    void writeAuditLog({
      action: 'SYSTEM_CONFIG_UPDATED',
      userId: adminId,
      resourceType: 'system_config',
      resourceId: fullKey,
      metadata: { key: c.key, oldValue: old?.value ?? null, newValue: c.value },
    });
  }

  return listSystemConfigs();
}

/**
 * Reads a system config string value with fallback.
 * Used by business modules (rate limiting, etc.).
 */
export async function getSystemConfig(key: string, defaultValue: string): Promise<string> {
  try {
    const db = createServiceRoleClient();
    const fullKey = key.startsWith(SYSTEM_PREFIX) ? key : `${SYSTEM_PREFIX}${key}`;
    const { data, error } = await db
      .from('site_settings')
      .select('value')
      .eq('key', fullKey)
      .single();

    if (!error && data) return data.value;
  } catch { /* fallback */ }
  return defaultValue;
}

/**
 * Reads a system config integer value with fallback.
 */
export async function getSystemConfigInt(key: string, defaultValue: number): Promise<number> {
  const val = await getSystemConfig(key, String(defaultValue));
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}
