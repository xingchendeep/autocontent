import { createServiceRoleClient } from '@/lib/db/client';
import { writeAuditLog } from '@/lib/db/audit-logger';
import { logger } from '@/lib/logger';

export interface SiteSetting {
  key: string;
  value: string;
  valueType: string;
  updatedBy: string | null;
  updatedAt: string;
}

/**
 * Returns all site settings (excludes system: prefixed keys).
 */
export async function getAllSiteSettings(): Promise<SiteSetting[]> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('site_settings')
    .select('key, value, value_type, updated_by, updated_at')
    .not('key', 'like', 'system:%')
    .order('key');

  if (error) {
    logger.error('getAllSiteSettings failed', { error: error.message });
    return [];
  }

  return (data ?? []).map((r) => ({
    key: r.key,
    value: r.value,
    valueType: r.value_type,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  }));
}

/**
 * Batch-updates site settings. Records audit log for each changed key.
 */
export async function updateSiteSettings(
  settings: Array<{ key: string; value: string }>,
  adminId: string,
): Promise<SiteSetting[]> {
  const db = createServiceRoleClient();

  for (const s of settings) {
    // Read old value for audit
    const { data: old } = await db
      .from('site_settings')
      .select('value')
      .eq('key', s.key)
      .single();

    const { error } = await db
      .from('site_settings')
      .update({ value: s.value, updated_by: adminId, updated_at: new Date().toISOString() })
      .eq('key', s.key);

    if (error) {
      logger.error('updateSiteSettings: update failed', { key: s.key, error: error.message });
      continue;
    }

    void writeAuditLog({
      action: 'SITE_SETTING_UPDATED',
      userId: adminId,
      resourceType: 'site_setting',
      resourceId: s.key,
      metadata: { key: s.key, oldValue: old?.value ?? null, newValue: s.value },
    });
  }

  return getAllSiteSettings();
}

/**
 * Reads a single site setting with fallback to a default value.
 * Used by front-end Server Components (Hero, layout metadata, etc.).
 * Never throws — returns defaultValue on any error.
 */
export async function getSiteSettingWithDefault(
  key: string,
  defaultValue: string,
): Promise<string> {
  try {
    const db = createServiceRoleClient();
    const { data, error } = await db
      .from('site_settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error || !data) return defaultValue;
    return data.value;
  } catch {
    return defaultValue;
  }
}
