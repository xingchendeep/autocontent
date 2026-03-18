import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { listUsers } from '@/lib/admin/users';
import { paginationSchema } from '@/lib/validations/admin';

export async function GET(request: NextRequest) {
  return handleAdminRoute(async () => {
    await requireAdmin();
    const sp = request.nextUrl.searchParams;
    const { page, pageSize } = paginationSchema.parse({
      page: sp.get('page') ?? '1',
      pageSize: sp.get('pageSize') ?? '20',
    });
    return listUsers({
      page,
      pageSize,
      search: sp.get('search') ?? undefined,
      role: sp.get('role') ?? undefined,
      plan: sp.get('plan') ?? undefined,
      status: sp.get('status') ?? undefined,
    });
  });
}
