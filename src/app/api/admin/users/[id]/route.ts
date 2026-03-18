import { NextRequest } from 'next/server';
import { requireAdmin, AdminAuthError } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { getUserDetail, updateUserStatus, updateUserRole } from '@/lib/admin/users';
import { updateUserSchema } from '@/lib/validations/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleAdminRoute(async () => {
    await requireAdmin();
    const { id } = await params;
    const detail = await getUserDetail(id);
    if (!detail) throw new AdminAuthError('FORBIDDEN', '用户不存在');
    return detail;
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleAdminRoute(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const input = updateUserSchema.parse(body);

    if (input.role !== undefined) {
      if (admin.role !== 'super_admin') {
        throw new AdminAuthError('FORBIDDEN', '需要超级管理员权限才能修改角色');
      }
      await updateUserRole(id, input.role, admin.id);
    }

    if (input.isDisabled !== undefined) {
      await updateUserStatus(id, input.isDisabled, admin.id);
    }

    return { id, updated: true };
  });
}
