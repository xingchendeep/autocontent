import { NextRequest } from 'next/server';
import { requireAdmin, AdminAuthError } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { getGenerationDetail, deleteGeneration } from '@/lib/admin/generations';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleAdminRoute(async () => {
    await requireAdmin();
    const { id } = await params;
    const detail = await getGenerationDetail(id);
    if (!detail) throw new AdminAuthError('FORBIDDEN', '记录不存在');
    return detail;
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleAdminRoute(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    await deleteGeneration(id, admin.id);
    return { deleted: true };
  });
}
