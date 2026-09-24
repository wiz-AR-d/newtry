import { useState, useEffect } from 'react';
import { DealGenerator } from './components/DealGenerator';
import { RoleplayStudio } from './components/RoleplayStudio';
import type { DealContext, RoleplaySession } from './types';

export function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname || '/try');
  const [dealId, setDealId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('deal_id') || '';
  });
  const [sessionId, setSessionId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('session_id') || '';
  });
  const [dealContext, setDealContext] = useState<DealContext | null>(null);
  const [, setRoleplaySession] = useState<RoleplaySession | null>(null);

  // Sync state with browser location
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname || '/try';
      const params = new URLSearchParams(window.location.search);
      setCurrentPath(path);
      setDealId(params.get('deal_id') || '');
      setSessionId(params.get('session_id') || '');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Navigation Helpers
  const navigateToRoleplay = (newDealId: string, context?: DealContext) => {
    setDealId(newDealId);
    if (context) setDealContext(context);
    const newUrl = `/try/roleplay?deal_id=${encodeURIComponent(newDealId)}`;
    window.history.pushState(null, '', newUrl);
    setCurrentPath('/try/roleplay');
  };

  const navigateToDealPrep = () => {
    window.history.pushState(null, '', '/try');
    setCurrentPath('/try');
  };

  // Route 2: /try/roleplay
  if (currentPath.includes('/try/roleplay')) {
    return (
      <RoleplayStudio
        dealId={dealId}
        dealContext={dealContext}
        onNavigateToCopilot={(dId, sId) => navigateToCopilot(dId, sId)}
        onBackToDealPrep={navigateToDealPrep}
      />
    );
  }

  // Route 1: /try or default entry
  return (
    <DealGenerator
      onDealGenerated={(generatedDealId, generatedContext) => {
        setDealContext(generatedContext);
        setRoleplaySession(null);
        navigateToRoleplay(generatedDealId, generatedContext);
      }}
    />
  );
}

export default App;
