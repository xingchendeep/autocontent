import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { getSubscriptionDistribution } from '@/lib/admin/analytics';

export async function GET() {
  return handleAdminRoute(async () => {
    await requireAdmin();
    return getSubscriptionDistribution();
  });
}
