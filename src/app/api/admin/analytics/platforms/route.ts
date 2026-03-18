import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { getPlatformDistribution } from '@/lib/admin/analytics';

export async function GET() {
  return handleAdminRoute(async () => {
    await requireAdmin();
    return getPlatformDistribution(30);
  });
}
