import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useSocket } from '../hooks/useSocket';

type OrchestratorContextValue = ReturnType<typeof useSocket>;

const OrchestratorContext = createContext<OrchestratorContextValue | null>(null);

export function OrchestratorProvider({ children }: { children: ReactNode }) {
  const socket = useSocket();
  return <OrchestratorContext.Provider value={socket}>{children}</OrchestratorContext.Provider>;
}

export function useOrchestrator() {
  const ctx = useContext(OrchestratorContext);
  if (!ctx) throw new Error('useOrchestrator must be used within OrchestratorProvider');
  return ctx;
}
