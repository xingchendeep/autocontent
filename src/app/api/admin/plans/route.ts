import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { listPlans } from '@/lib/admin/plans';

export async function GET() {
  return handleAdminRoute(async () => {
    await requireAdmin();
    return listPlans();
  });
}
