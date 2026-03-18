import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { listScripts } from '@/lib/admin/scripts';
import { paginationSchema } from '@/lib/validations/admin';

export async function GET(request: NextRequest) {
  return handleAdminRoute(async () => {
    await requireAdmin();
    const sp = request.nextUrl.searchParams;
    const { page, pageSize } = paginationSchema.parse({
      page: sp.get('page') ?? '1',
      pageSize: sp.get('pageSize') ?? '20',
    });
    return listScripts({
      page,
      pageSize,
      userId: sp.get('userId') ?? undefined,
      search: sp.get('search') ?? undefined,
      source: sp.get('source') ?? undefined,
    });
  });
}
