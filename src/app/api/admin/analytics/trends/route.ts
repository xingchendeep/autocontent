import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { getGenerationTrends } from '@/lib/admin/analytics';

export async function GET() {
  return handleAdminRoute(async () => {
    await requireAdmin();
    return getGenerationTrends(30);
  });
}
