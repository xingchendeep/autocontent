import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { updatePlan } from '@/lib/admin/plans';
import { z } from 'zod';
import type { NextRequest } from 'next/server';

const updatePlanSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  priceCents: z.number().int().min(0).optional(),
  monthlyGenerationLimit: z.number().int().min(1).nullable().optional(),
  platformLimit: z.number().int().min(1).nullable().optional(),
  speedTier: z.enum(['standard', 'fast', 'priority', 'dedicated']).optional(),
  hasHistory: z.boolean().optional(),
  hasApiAccess: z.boolean().optional(),
  hasTeamAccess: z.boolean().optional(),
  hasBatchAccess: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleAdminRoute(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const input = updatePlanSchema.parse(body);
    return updatePlan(id, input, admin.id);
  });
}
