import { createServiceRoleClient } from '@/lib/db/client';
import { writeAuditLog } from '@/lib/db/audit-logger';
import { PLATFORM_TEMPLATES, type PlatformTemplate } from '@/lib/ai/templates';
import type { PlatformCode } from '@/types';

export interface SystemTemplate {
  platform: string;
  displayName: string;
  promptInstructions: string;
  maxTitleLength: number;
  maxContentLength: number;
  hashtagStyle: string;
  promptVersion: string;
  updatedBy: string | null;
  updatedAt: string;
}

export async function listSystemTemplates(): Promise<SystemTemplate[]> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('system_templates')
    .select('*')
    .order('platform');

  if (error || !data) return [];

  return data.map((r) => ({
    platform: r.platform,
    displayName: r.display_name,
    promptInstructions: r.prompt_instructions,
    maxTitleLength: r.max_title_length,
    maxContentLength: r.max_content_length,
    hashtagStyle: r.hashtag_style,
    promptVersion: r.prompt_version,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  }));
}

export async function updateSystemTemplate(
  platform: string,
  data: Record<string, unknown>,
  adminId: string,
): Promise<SystemTemplate | null> {
  const db = createServiceRoleClient();

  const updatePayload: Record<string, unknown> = { updated_by: adminId, updated_at: new Date().toISOString() };
  const changedFields: string[] = [];

  if (data.displayName !== undefined) { updatePayload.display_name = data.displayName; changedFields.push('display_name'); }
  if (data.promptInstructions !== undefined) { updatePayload.prompt_instructions = data.promptInstructions; changedFields.push('prompt_instructions'); }
  if (data.maxTitleLength !== undefined) { updatePayload.max_title_length = data.maxTitleLength; changedFields.push('max_title_length'); }
  if (data.maxContentLength !== undefined) { updatePayload.max_content_length = data.maxContentLength; changedFields.push('max_content_length'); }
  if (data.hashtagStyle !== undefined) { updatePayload.hashtag_style = data.hashtagStyle; changedFields.push('hashtag_style'); }
  if (data.promptVersion !== undefined) { updatePayload.prompt_version = data.promptVersion; changedFields.push('prompt_version'); }

  const { error } = await db
    .from('system_templates')
    .update(updatePayload)
    .eq('platform', platform);

  if (error) throw new Error(`更新模板失败: ${error.message}`);

  void writeAuditLog({
    action: 'TEMPLATE_UPDATED',
    userId: adminId,
    resourceType: 'system_template',
    resourceId: platform,
    metadata: { platform, changedFields },
  });

  // Return updated
  const { data: row } = await db.from('system_templates').select('*').eq('platform', platform).single();
  if (!row) return null;
  return {
    platform: row.platform,
    displayName: row.display_name,
    promptInstructions: row.prompt_instructions,
    maxTitleLength: row.max_title_length,
    maxContentLength: row.max_content_length,
    hashtagStyle: row.hashtag_style,
    promptVersion: row.prompt_version,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

/**
 * Reads a system template from DB with fallback to hardcoded PLATFORM_TEMPLATES.
 * Used by the AI generation service.
 */
export async function getSystemTemplate(platform: PlatformCode): Promise<PlatformTemplate> {
  try {
    const db = createServiceRoleClient();
    const { data, error } = await db
      .from('system_templates')
      .select('*')
      .eq('platform', platform)
      .single();

    if (!error && data) {
      return {
        platform: data.platform as PlatformCode,
        displayName: data.display_name,
        promptInstructions: data.prompt_instructions,
        maxTitleLength: data.max_title_length,
        maxContentLength: data.max_content_length,
        hashtagStyle: data.hashtag_style as 'inline' | 'trailing' | 'none',
        promptVersion: data.prompt_version,
      };
    }
  } catch { /* fallback */ }

  return PLATFORM_TEMPLATES[platform];
}
