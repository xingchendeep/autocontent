'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TeamSummary, ApiSuccess, ApiError } from '@/types';
import { useToast } from '@/contexts/ToastContext';

export interface UseTeamsReturn {
  teams: TeamSummary[];
  loading: boolean;
  error: string | null;
  create: (name: string) => Promise<boolean>;
  refresh: () => void;
}

export function useTeams(): UseTeamsReturn {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/teams');
      const body: ApiSuccess<{ items: TeamSummary[] }> | ApiError = await res.json();
      if (body.success) {
        setTeams(body.data.items);
      } else {
        setError(body.error.message);
      }
    } catch {
      setError('获取团队列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const create = useCallback(async (name: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const body: ApiSuccess<TeamSummary> | ApiError = await res.json();
      if (body.success) {
        setTeams((prev) => [...prev, body.data]);
        toast({ type: 'success', message: '团队创建成功' });
        return true;
      }
      if (res.status === 402) {
        setError('PLAN_LIMIT_REACHED');
      }
      toast({ type: 'error', message: body.error.message });
      return false;
    } catch {
      toast({ type: 'error', message: '创建团队失败' });
      return false;
    }
  }, [toast]);

  return { teams, loading, error, create, refresh: fetchTeams };
}
