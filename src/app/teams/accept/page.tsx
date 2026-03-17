import { createServiceRoleClient } from '@/lib/db/client';
import { getSession } from '@/lib/auth';
import { InvitationAccept } from '@/components/teams/InvitationAccept';

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function AcceptInvitationPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="mb-2 text-xl font-semibold text-zinc-900">无效链接</h1>
        <p className="text-sm text-zinc-500">缺少邀请 token 参数</p>
      </div>
    );
  }

  const db = createServiceRoleClient();
  const { data: inv } = await db
    .from('team_invitations')
    .select('id, team_id, role, expires_at, accepted_at, teams(name)')
    .eq('token', token)
    .maybeSingle();

  if (!inv) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="mb-2 text-xl font-semibold text-zinc-900">邀请不存在</h1>
        <p className="text-sm text-zinc-500">该邀请链接无效或已被使用</p>
      </div>
    );
  }

  const expired = !!inv.accepted_at || new Date(inv.expires_at) < new Date();
  const teamName = (inv.teams as unknown as { name: string } | { name: string }[] | null);
  const resolvedTeamName = Array.isArray(teamName) ? teamName[0]?.name : teamName?.name ?? '未知团队';
  const session = await getSession();

  return (
    <InvitationAccept
      token={token}
      teamId={inv.team_id}
      teamName={resolvedTeamName ?? '未知团队'}
      role={inv.role}
      expired={expired}
      isLoggedIn={!!session}
    />
  );
}
