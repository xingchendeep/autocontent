import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { updateUserSubscription } from '@/lib/admin/users';
import { updateUserSubscriptionSchema } from '@/lib/validations/admin';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleAdminRoute(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const input = updateUserSubscriptionSchema.parse(body);
    await updateUserSubscription(id, input.planCode, admin.id);
    return { id, planCode: input.planCode, updated: true };
  });
}
