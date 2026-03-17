import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { BatchPanel } from '@/components/dashboard/BatchPanel';

export default async function BatchPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return <BatchPanel />;
}
