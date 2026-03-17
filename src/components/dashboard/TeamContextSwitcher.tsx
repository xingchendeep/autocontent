'use client';

import { useTeams } from '@/hooks/useTeams';
import { useTeamContext } from '@/contexts/TeamContext';

export function TeamContextSwitcher() {
  const { teams, loading } = useTeams();
  const { currentTeamId, setTeamId } = useTeamContext();

  const safeTeams = teams ?? [];

  // Only show if user belongs to at least one team
  if (loading || safeTeams.length === 0) return null;

  return (
    <select
      value={currentTeamId ?? ''}
      onChange={(e) => setTeamId(e.target.value || null)}
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
      aria-label="切换团队上下文"
    >
      <option value="">个人</option>
      {safeTeams.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}
