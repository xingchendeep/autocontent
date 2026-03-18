import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { getTopUsers } from '@/lib/admin/analytics';

export async function GET() {
  return handleAdminRoute(async () => {
    await requireAdmin();
    return getTopUsers(10);
  });
}
