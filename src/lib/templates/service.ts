import { createServiceRoleClient } from '@/lib/db/client';

export type ToneValue = 'professional' | 'casual' | 'humorous' | 'authoritative' | 'empathetic';
export type LengthValue = 'short' | 'medium' | 'long';

export interface UserTemplate {
  id: string;
  userId: string;
  name: string;
  tone: ToneValue;
  length: LengthValue;
  customInstructions?: string;
  platformOverrides: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  name: string;
  tone: ToneValue;
  length?: LengthValue;
  customInstructions?: string;
  platformOverrides?: Record<string, unknown>;
}

// DB row → domain type
function mapRow(row: Record<string, unknown>): UserTemplate {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    tone: row.tone as ToneValue,
    length: row.length as LengthValue,
    customInstructions: (row.custom_instructions as string | null) ?? undefined,
    platformOverrides: (row.platform_overrides as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function createTemplate(
  userId: string,
  input: CreateTemplateInput,
): Promise<UserTemplate> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('user_templates')
    .insert({
      user_id: userId,
      name: input.name,
      tone: input.tone,
      length: input.length ?? 'medium',
      custom_instructions: input.customInstructions ?? null,
      platform_overrides: input.platformOverrides ?? {},
    })
    .select()
    .single();

  if (error) throw new Error(`createTemplate: ${error.message}`);
  return mapRow(data as Record<string, unknown>);
}

export async function listTemplates(
  userId: string,
  teamId?: string,
): Promise<UserTemplate[]> {
  const db = createServiceRoleClient();

  if (teamId) {
    // Return templates belonging to any member of the team
    const { data, error } = await db
      .from('user_templates')
      .select('*, team_members!inner(team_id)')
      .eq('team_members.team_id', teamId)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`listTemplates(team): ${error.message}`);
    return (data as Record<string, unknown>[]).map(mapRow);
  }

  const { data, error } = await db
    .from('user_templates')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`listTemplates: ${error.message}`);
  return (data as Record<string, unknown>[]).map(mapRow);
}

export async function getTemplateById(
  id: string,
  userId: string,
): Promise<UserTemplate | null> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('user_templates')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`getTemplateById: ${error.message}`);
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function updateTemplate(
  id: string,
  userId: string,
  input: Partial<CreateTemplateInput>,
): Promise<UserTemplate | null> {
  const db = createServiceRoleClient();

  // Verify ownership first
  const existing = await getTemplateById(id, userId);
  if (!existing) return null;

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.tone !== undefined) patch.tone = input.tone;
  if (input.length !== undefined) patch.length = input.length;
  if (input.customInstructions !== undefined) patch.custom_instructions = input.customInstructions;
  if (input.platformOverrides !== undefined) patch.platform_overrides = input.platformOverrides;

  const { data, error } = await db
    .from('user_templates')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(`updateTemplate: ${error.message}`);
  return mapRow(data as Record<string, unknown>);
}

export async function deleteTemplate(
  id: string,
  userId: string,
): Promise<boolean> {
  const db = createServiceRoleClient();

  // Verify ownership first
  const existing = await getTemplateById(id, userId);
  if (!existing) return false;

  const { error } = await db
    .from('user_templates')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw new Error(`deleteTemplate: ${error.message}`);
  return true;
}
