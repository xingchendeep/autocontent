import crypto from 'crypto';
import { createServiceRoleClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';

// --- Types ---

export interface Team {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  teamId: string;
  invitedEmail: string;
  invitedBy: string;
  token: string;
  role: 'admin' | 'member';
  expiresAt: string;
  createdAt: string;
  emailSent: boolean;
}

export type TeamRole = 'owner' | 'admin' | 'member';

// --- Service ---

/**
 * Creates a new team and inserts the creator as owner.
 */
export async function createTeam(ownerId: string, name: string): Promise<Team> {
  const db = createServiceRoleClient();

  const { data: team, error: teamError } = await db
    .from('teams')
    .insert({ name, owner_id: ownerId })
    .select('id, name, owner_id, created_at, updated_at')
    .single();

  if (teamError || !team) {
    throw new Error(`createTeam: failed to create team: ${teamError?.message}`);
  }

  const { error: memberError } = await db
    .from('team_members')
    .insert({ team_id: team.id, user_id: ownerId, role: 'owner' });

  if (memberError) {
    // Attempt cleanup — best effort
    await db.from('teams').delete().eq('id', team.id);
    throw new Error(`createTeam: failed to insert owner member: ${memberError.message}`);
  }

  return mapTeam(team);
}

/**
 * Returns all teams the user belongs to (as any role).
 */
export async function listTeamsForUser(userId: string): Promise<Team[]> {
  const db = createServiceRoleClient();

  const { data, error } = await db
    .from('team_members')
    .select('teams(id, name, owner_id, created_at, updated_at)')
    .eq('user_id', userId);

  if (error) throw new Error(`listTeamsForUser: ${error.message}`);

  return (data ?? [])
    .map((row: { teams: unknown }) => row.teams)
    .filter((t): t is Record<string, unknown> => Boolean(t))
    .map(mapTeam);
}

/**
 * Sends a team invitation. Creates the DB record and attempts to send an email via Resend.
 * Email failure does NOT prevent the invitation from being created.
 */
export async function inviteToTeam(
  teamId: string,
  invitedBy: string,
  email: string,
  role: 'admin' | 'member',
): Promise<Invitation> {
  const db = createServiceRoleClient();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: inv, error } = await db
    .from('team_invitations')
    .insert({
      team_id: teamId,
      invited_email: email,
      invited_by: invitedBy,
      token,
      role,
      expires_at: expiresAt,
    })
    .select('id, team_id, invited_email, invited_by, token, role, expires_at, created_at')
    .single();

  if (error || !inv) {
    throw new Error(`inviteToTeam: failed to create invitation: ${error?.message}`);
  }

  let emailSent = false;
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
      const inviteUrl = `${appUrl}/teams/accept?token=${token}`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'AutoContent Pro <noreply@autocontent.pro>',
          to: email,
          subject: '您已被邀请加入团队',
          html: `<p>点击以下链接接受邀请：<a href="${inviteUrl}">${inviteUrl}</a></p><p>链接有效期 7 天。</p>`,
        }),
      });
      emailSent = res.ok;
      if (!res.ok) {
        logger.warn('inviteToTeam: email send failed', { status: res.status, email });
      }
    }
  } catch (err) {
    logger.error('inviteToTeam: email send threw', { error: String(err), email });
  }

  return {
    id: inv.id,
    teamId: inv.team_id,
    invitedEmail: inv.invited_email,
    invitedBy: inv.invited_by,
    token: inv.token,
    role: inv.role,
    expiresAt: inv.expires_at,
    createdAt: inv.created_at,
    emailSent,
  };
}

/**
 * Accepts a team invitation by token. Validates expiry and usage, then inserts a team_member row.
 */
export async function acceptInvitation(token: string, userId: string): Promise<TeamMember> {
  const db = createServiceRoleClient();

  const { data: inv, error: invError } = await db
    .from('team_invitations')
    .select('id, team_id, role, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle();

  if (invError) throw new Error(`acceptInvitation: query failed: ${invError.message}`);
  if (!inv) throw Object.assign(new Error('Token not found'), { code: 'NOT_FOUND' });
  if (inv.accepted_at) throw Object.assign(new Error('Invitation already used'), { code: 'INVITATION_USED' });
  if (new Date(inv.expires_at) < new Date()) throw Object.assign(new Error('Invitation expired'), { code: 'INVITATION_EXPIRED' });

  const { data: member, error: memberError } = await db
    .from('team_members')
    .insert({ team_id: inv.team_id, user_id: userId, role: inv.role })
    .select('id, team_id, user_id, role, joined_at')
    .single();

  if (memberError) {
    // Unique constraint violation means already a member
    if (memberError.code === '23505') {
      throw Object.assign(new Error('User is already a team member'), { code: 'ALREADY_MEMBER' });
    }
    throw new Error(`acceptInvitation: insert member failed: ${memberError.message}`);
  }

  await db
    .from('team_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', inv.id);

  return mapMember(member);
}

/**
 * Removes a member from a team. Requester must be owner; target must not be the last owner.
 */
export async function removeMember(
  teamId: string,
  requesterId: string,
  targetUserId: string,
): Promise<void> {
  const db = createServiceRoleClient();

  // Verify requester is owner
  const requesterRole = await getMemberRole(teamId, requesterId);
  if (requesterRole !== 'owner') {
    throw Object.assign(new Error('Only owners can remove members'), { code: 'FORBIDDEN' });
  }

  // Verify target exists in team
  const targetRole = await getMemberRole(teamId, targetUserId);
  if (!targetRole) {
    throw Object.assign(new Error('Target user is not a team member'), { code: 'NOT_FOUND' });
  }

  // Prevent removing the last owner
  if (targetRole === 'owner') {
    const { count } = await db
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('role', 'owner');

    if ((count ?? 0) <= 1) {
      throw Object.assign(new Error('Cannot remove the last owner'), { code: 'FORBIDDEN' });
    }
  }

  const { error } = await db
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', targetUserId);

  if (error) throw new Error(`removeMember: delete failed: ${error.message}`);
}

/**
 * Returns the role of a user in a team, or null if not a member.
 */
export async function getMemberRole(teamId: string, userId: string): Promise<TeamRole | null> {
  const db = createServiceRoleClient();

  const { data, error } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`getMemberRole: ${error.message}`);
  return data ? (data.role as TeamRole) : null;
}

// --- Mappers ---

function mapTeam(row: Record<string, unknown>): Team {
  return {
    id: row.id as string,
    name: row.name as string,
    ownerId: (row.owner_id ?? row.ownerId) as string,
    createdAt: (row.created_at ?? row.createdAt) as string,
    updatedAt: (row.updated_at ?? row.updatedAt) as string,
  };
}

function mapMember(row: Record<string, unknown>): TeamMember {
  return {
    id: row.id as string,
    teamId: (row.team_id ?? row.teamId) as string,
    userId: (row.user_id ?? row.userId) as string,
    role: (row.role as TeamRole),
    joinedAt: (row.joined_at ?? row.joinedAt) as string,
  };
}
