import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';

export type AdminRole = 'admin' | 'super_admin';

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
}

/**
 * Error thrown when admin authentication or authorization fails.
 * The `code` field maps directly to an ErrorCode for API responses.
 */
export class AdminAuthError extends Error {
  constructor(
    public readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'ACCOUNT_DISABLED',
    message: string,
  ) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

/**
 * Verifies the current user is authenticated and has admin or super_admin role.
 * Uses service role client to bypass RLS when reading profiles.
 *
 * @throws AdminAuthError with code UNAUTHORIZED if no session
 * @throws AdminAuthError with code ACCOUNT_DISABLED if user is disabled
 * @throws AdminAuthError with code FORBIDDEN if user role is not admin/super_admin
 */
export async function requireAdmin(): Promise<AdminUser> {
  const session = await getSession();
  if (!session) {
    throw new AdminAuthError('UNAUTHORIZED', '请先登录');
  }

  const db = createServiceRoleClient();
  const { data: profile, error } = await db
    .from('profiles')
    .select('role, is_disabled')
    .eq('id', session.id)
    .single();

  if (error || !profile) {
    logger.warn('requireAdmin: profile lookup failed', {
      userId: session.id,
      error: error?.message,
    });
    throw new AdminAuthError('FORBIDDEN', '无管理员权限');
  }

  if (profile.is_disabled) {
    throw new AdminAuthError('ACCOUNT_DISABLED', '账户已被禁用');
  }

  if (profile.role !== 'admin' && profile.role !== 'super_admin') {
    throw new AdminAuthError('FORBIDDEN', '无管理员权限');
  }

  return {
    id: session.id,
    email: session.email,
    role: profile.role as AdminRole,
  };
}

/**
 * Verifies the current user is authenticated and has super_admin role.
 * Used for operations that require elevated privileges (e.g., role changes).
 *
 * @throws AdminAuthError with code UNAUTHORIZED if no session
 * @throws AdminAuthError with code ACCOUNT_DISABLED if user is disabled
 * @throws AdminAuthError with code FORBIDDEN if user role is not super_admin
 */
export async function requireSuperAdmin(): Promise<AdminUser> {
  const admin = await requireAdmin();

  if (admin.role !== 'super_admin') {
    throw new AdminAuthError('FORBIDDEN', '需要超级管理员权限');
  }

  return admin;
}
