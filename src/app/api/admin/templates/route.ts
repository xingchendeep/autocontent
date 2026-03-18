import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { listSystemTemplates } from '@/lib/admin/templates';

export async function GET() {
  return handleAdminRoute(async () => {
    await requireAdmin();
    return listSystemTemplates();
  });
}
