import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { listGenerations } from '@/lib/admin/generations';
import { paginationSchema } from '@/lib/validations/admin';

export async function GET(request: NextRequest) {
  return handleAdminRoute(async () => {
    await requireAdmin();
    const sp = request.nextUrl.searchParams;
    const { page, pageSize } = paginationSchema.parse({
      page: sp.get('page') ?? '1',
      pageSize: sp.get('pageSize') ?? '20',
    });
    return listGenerations({
      page,
      pageSize,
      userId: sp.get('userId') ?? undefined,
      platform: sp.get('platform') ?? undefined,
      status: sp.get('status') ?? undefined,
      startDate: sp.get('startDate') ?? undefined,
      endDate: sp.get('endDate') ?? undefined,
      search: sp.get('search') ?? undefined,
      sortBy: sp.get('sortBy') ?? undefined,
      sortOrder: sp.get('sortOrder') ?? undefined,
    });
  });
}
