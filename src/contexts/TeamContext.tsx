'use client';

import { createContext, useCallback, useContext, useState } from 'react';

interface TeamContextValue {
  currentTeamId: string | null;
  setTeamId: (teamId: string | null) => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamContextProvider({ children }: { children: React.ReactNode }) {
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);

  const setTeamId = useCallback((teamId: string | null) => {
    setCurrentTeamId(teamId);
  }, []);

  return (
    <TeamContext.Provider value={{ currentTeamId, setTeamId }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeamContext(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) {
    // Defensive: return no-op if provider not mounted
    return { currentTeamId: null, setTeamId: () => {} };
  }
  return ctx;
}
