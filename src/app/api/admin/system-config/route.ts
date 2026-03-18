import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { listSystemConfigs, updateSystemConfigs } from '@/lib/admin/system-config';
import { updateSystemConfigSchema } from '@/lib/validations/admin';

export async function GET() {
  return handleAdminRoute(async () => {
    await requireAdmin();
    return listSystemConfigs();
  });
}

export async function PUT(request: NextRequest) {
  return handleAdminRoute(async () => {
    const admin = await requireAdmin();
    const body = await request.json();
    const input = updateSystemConfigSchema.parse(body);
    return updateSystemConfigs(input.configs, admin.id);
  });
}
