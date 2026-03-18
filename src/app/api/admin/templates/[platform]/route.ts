import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { updateSystemTemplate } from '@/lib/admin/templates';
import { updateSystemTemplateSchema } from '@/lib/validations/admin';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  return handleAdminRoute(async () => {
    const admin = await requireAdmin();
    const { platform } = await params;
    const body = await request.json();
    const input = updateSystemTemplateSchema.parse(body);
    const result = await updateSystemTemplate(platform, input, admin.id);
    if (!result) throw new Error('模板不存在');
    return result;
  });
}
