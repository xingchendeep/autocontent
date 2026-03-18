import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { createServiceRoleClient } from '@/lib/db/client';
import { paginationSchema } from '@/lib/validations/admin';

export async function GET(request: NextRequest) {
  return handleAdminRoute(async () => {
    await requireAdmin();
    const sp = request.nextUrl.searchParams;
    const { page, pageSize } = paginationSchema.parse({
      page: sp.get('page') ?? '1',
      pageSize: sp.get('pageSize') ?? '50',
    });
    const offset = (page - 1) * pageSize;
    const db = createServiceRoleClient();

    let query = db
      .from('audit_logs')
      .select('id, user_id, action, resource_type, resource_id, ip_address, metadata, created_at', { count: 'exact' });

    const action = sp.get('action');
    const userId = sp.get('userId');
    const resourceType = sp.get('resourceType');
    const startDate = sp.get('startDate');
    const endDate = sp.get('endDate');

    if (action) query = query.eq('action', action);
    if (userId) query = query.eq('user_id', userId);
    if (resourceType) query = query.eq('resource_type', resourceType);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error || !data) return { items: [], total: 0, page, pageSize };

    // Fetch emails
    const userIds = [...new Set(data.filter((l) => l.user_id).map((l) => l.user_id as string))];
    const emailMap = new Map<string, string>();
    if (userIds.length > 0) {
      try {
        const { data: { users } } = await db.auth.admin.listUsers({ perPage: 1000 });
        for (const u of users) { if (u.email) emailMap.set(u.id, u.email); }
      } catch { /* ignore */ }
    }

    const items = data.map((l) => ({
      id: l.id,
      userEmail: l.user_id ? (emailMap.get(l.user_id) ?? null) : 'System',
      action: l.action,
      resourceType: l.resource_type,
      resourceId: l.resource_id,
      ipAddress: l.ip_address,
      metadata: l.metadata ?? {},
      createdAt: l.created_at,
    }));

    return { items, total: count ?? 0, page, pageSize };
  });
}
