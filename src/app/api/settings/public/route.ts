import { NextResponse } from 'next/server';
import { createSuccess, generateRequestId } from '@/lib/errors';
import { createServiceRoleClient } from '@/lib/db/client';

/** Public keys that can be read without authentication */
const PUBLIC_KEYS = [
  'site_title',
  'site_description',
  'hero_title',
  'hero_description',
  'copyright_text',
  'meta_keywords',
];

/**
 * GET /api/settings/public
 * Returns public site settings as a key-value map. No auth required.
 */
export async function GET() {
  const requestId = generateRequestId();
  try {
    const db = createServiceRoleClient();
    const { data, error } = await db
      .from('site_settings')
      .select('key, value')
      .in('key', PUBLIC_KEYS);

    if (error) {
      return NextResponse.json(createSuccess({} as Record<string, string>, requestId));
    }

    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      map[row.key] = row.value;
    }

    return NextResponse.json(createSuccess(map, requestId));
  } catch {
    return NextResponse.json(createSuccess({} as Record<string, string>, requestId));
  }
}
