import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/db/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { ToastProvider } from '@/contexts/ToastContext';

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const db = createServiceRoleClient();
  const { data: profile } = await db
    .from('profiles')
    .select('role, is_disabled')
    .eq('id', session.id)
    .single();

  if (
    !profile ||
    profile.is_disabled ||
    (profile.role !== 'admin' && profile.role !== 'super_admin')
  ) {
    redirect('/dashboard');
  }

  return (
    <ToastProvider>
      <AdminLayout email={session.email} role={profile.role}>
        {children}
      </AdminLayout>
    </ToastProvider>
  );
}
