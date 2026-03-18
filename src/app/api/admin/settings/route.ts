import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { handleAdminRoute } from '@/lib/admin/route-helper';
import { getAllSiteSettings, updateSiteSettings } from '@/lib/admin/site-settings';
import { updateSiteSettingsSchema } from '@/lib/validations/admin';

export async function GET() {
  return handleAdminRoute(async () => {
    await requireAdmin();
    return getAllSiteSettings();
  });
}

export async function PUT(request: NextRequest) {
  return handleAdminRoute(async () => {
    const admin = await requireAdmin();
    const body = await request.json();
    const input = updateSiteSettingsSchema.parse(body);
    return updateSiteSettings(input.settings, admin.id);
  });
}
