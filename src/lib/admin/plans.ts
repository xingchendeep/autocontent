import { createServiceRoleClient } from '@/lib/db/client';
import { writeAuditLog } from '@/lib/db/audit-logger';

export interface AdminPlanItem {
  id: string;
  code: string;
  displayName: string;
  priceCents: number;
  currency: string;
  monthlyGenerationLimit: number | null;
  platformLimit: number | null;
  speedTier: string;
  hasHistory: boolean;
  hasApiAccess: boolean;
  hasTeamAccess: boolean;
  hasBatchAccess: boolean;
  isActive: boolean;
  features: string[];
  updatedAt: string;
}

export async function listPlans(): Promise<AdminPlanItem[]> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('plans')
    .select('id, code, display_name, price_cents, currency, monthly_generation_limit, platform_limit, speed_tier, has_history, has_api_access, has_team_access, has_batch_access, is_active, metadata, updated_at')
    .order('price_cents', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    displayName: r.display_name,
    priceCents: r.price_cents,
    currency: r.currency,
    monthlyGenerationLimit: r.monthly_generation_limit,
    platformLimit: r.platform_limit,
    speedTier: r.speed_tier,
    hasHistory: r.has_history,
    hasApiAccess: r.has_api_access,
    hasTeamAccess: r.has_team_access,
    hasBatchAccess: r.has_batch_access,
    isActive: r.is_active,
    features: (r.metadata as Record<string, unknown>)?.features as string[] ?? [],
    updatedAt: r.updated_at,
  }));
}

export interface UpdatePlanInput {
  displayName?: string;
  priceCents?: number;
  monthlyGenerationLimit?: number | null;
  platformLimit?: number | null;
  speedTier?: string;
  hasHistory?: boolean;
  hasApiAccess?: boolean;
  hasTeamAccess?: boolean;
  hasBatchAccess?: boolean;
  isActive?: boolean;
  features?: string[];
}

export async function updatePlan(
  planId: string,
  input: UpdatePlanInput,
  adminId: string,
): Promise<AdminPlanItem> {
  const db = createServiceRoleClient();

  // Read old values for audit
  const { data: old, error: readErr } = await db
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (readErr || !old) throw new Error('套餐不存在');

  const updateData: Record<string, unknown> = {};
  if (input.displayName !== undefined) updateData.display_name = input.displayName;
  if (input.priceCents !== undefined) updateData.price_cents = input.priceCents;
  if (input.monthlyGenerationLimit !== undefined) updateData.monthly_generation_limit = input.monthlyGenerationLimit;
  if (input.platformLimit !== undefined) updateData.platform_limit = input.platformLimit;
  if (input.speedTier !== undefined) updateData.speed_tier = input.speedTier;
  if (input.hasHistory !== undefined) updateData.has_history = input.hasHistory;
  if (input.hasApiAccess !== undefined) updateData.has_api_access = input.hasApiAccess;
  if (input.hasTeamAccess !== undefined) updateData.has_team_access = input.hasTeamAccess;
  if (input.hasBatchAccess !== undefined) updateData.has_batch_access = input.hasBatchAccess;
  if (input.isActive !== undefined) updateData.is_active = input.isActive;
  if (input.features !== undefined) {
    // Merge features into existing metadata
    const oldMeta = (old.metadata as Record<string, unknown>) ?? {};
    updateData.metadata = { ...oldMeta, features: input.features };
  }

  if (Object.keys(updateData).length === 0) throw new Error('没有需要更新的字段');

  const { data: updated, error: updErr } = await db
    .from('plans')
    .update(updateData)
    .eq('id', planId)
    .select('id, code, display_name, price_cents, currency, monthly_generation_limit, platform_limit, speed_tier, has_history, has_api_access, has_team_access, has_batch_access, is_active, metadata, updated_at')
    .single();

  if (updErr) throw new Error(updErr.message);

  await writeAuditLog({
    userId: adminId,
    action: 'SITE_SETTING_UPDATED',
    resourceType: 'plan',
    resourceId: planId,
    metadata: {
      planCode: old.code,
      changes: updateData,
      oldPriceCents: old.price_cents,
      newPriceCents: input.priceCents ?? old.price_cents,
    },
  });

  return {
    id: updated.id,
    code: updated.code,
    displayName: updated.display_name,
    priceCents: updated.price_cents,
    currency: updated.currency,
    monthlyGenerationLimit: updated.monthly_generation_limit,
    platformLimit: updated.platform_limit,
    speedTier: updated.speed_tier,
    hasHistory: updated.has_history,
    hasApiAccess: updated.has_api_access,
    hasTeamAccess: updated.has_team_access,
    hasBatchAccess: updated.has_batch_access,
    isActive: updated.is_active,
    features: (updated.metadata as Record<string, unknown>)?.features as string[] ?? [],
    updatedAt: updated.updated_at,
  };
}
