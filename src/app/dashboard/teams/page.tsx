import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { TeamPanel } from '@/components/dashboard/TeamPanel';

export default async function TeamsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return <TeamPanel />;
}
