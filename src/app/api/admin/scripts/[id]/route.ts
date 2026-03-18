import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { deleteScript } from '@/lib/admin/scripts';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleAdminRoute(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    await deleteScript(id, admin.id);
    return { deleted: true };
  });
}
