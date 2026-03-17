'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TeamMember, ApiSuccess, ApiError } from '@/types';
import { useToast } from '@/contexts/ToastContext';

export interface UseTeamMembersReturn {
  members: TeamMember[];
  loading: boolean;
  error: string | null;
  invite: (email: string, role: 'admin' | 'member') => Promise<boolean>;
  removeMember: (userId: string) => Promise<boolean>;
  refresh: () => void;
}

export function useTeamMembers(teamId: string): UseTeamMembersReturn {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}`);
      const body: ApiSuccess<{ members: TeamMember[] }> | ApiError = await res.json();
      if (body.success) {
        setMembers(body.data.members);
      } else {
        setError(body.error.message);
      }
    } catch {
      setError('获取成员列表失败');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const invite = useCallback(async (email: string, role: 'admin' | 'member'): Promise<boolean> => {
    try {
      const res = await fetch(`/api/teams/${teamId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const body: ApiSuccess<unknown> | ApiError = await res.json();
      if (body.success) {
        toast({ type: 'success', message: '邀请已发送' });
        return true;
      }
      toast({ type: 'error', message: body.error.message });
      return false;
    } catch {
      toast({ type: 'error', message: '发送邀请失败' });
      return false;
    }
  }, [teamId, toast]);

  const removeMember = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
        method: 'DELETE',
      });
      const body: ApiSuccess<unknown> | ApiError = await res.json();
      if (body.success) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
        toast({ type: 'success', message: '成员已移除' });
        return true;
      }
      toast({ type: 'error', message: body.error.message });
      return false;
    } catch {
      toast({ type: 'error', message: '移除成员失败' });
      return false;
    }
  }, [teamId, toast]);

  return { members, loading, error, invite, removeMember, refresh: fetchMembers };
}
