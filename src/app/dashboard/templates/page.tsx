import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { TemplateManager } from '@/components/dashboard/TemplateManager';

export default async function TemplatesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return <TemplateManager />;
}
