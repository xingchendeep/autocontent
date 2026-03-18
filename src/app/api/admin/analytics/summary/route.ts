import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { getSummary } from '@/lib/admin/analytics';

export async function GET() {
  return handleAdminRoute(async () => {
    await requireAdmin();
    return getSummary();
  });
}
