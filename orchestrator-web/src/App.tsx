import { useState, useEffect, useCallback } from 'react';
import { useOrchestrator } from './context/OrchestratorContext';
import { SplashScreen } from './components/SplashScreen';
import { HomePage } from './components/home/HomePage';
import { PromptScreen } from './components/home/PromptScreen';
import { CreateWorkspaceView } from './components/home/CreateWorkspaceView';
import { AdHocPromptScreen } from './components/home/AdHocPromptScreen';
import { QuickStartView } from './components/home/QuickStartView';
import { SettingsPage } from './components/settings/SettingsPage';
import { SessionView } from './components/session/SessionView';
import type { SettingsTab } from './components/settings/SettingsSidebar';

type View =
  | { page: 'home' }
  | { page: 'prompt'; workspaceId: string }
  | { page: 'prompt-adhoc' }
  | { page: 'quickstart' }
  | { page: 'createWorkspace' }
  | { page: 'settings'; tab?: SettingsTab }
  | { page: 'session' };

function App() {
  const {
    port,
    checkingDependencies,
    dependencyCheck,
    backendError,
    session,
    projects,
    templates,
    workspaces,
    creatingProject,
    startingSession,
    startSession,
    createWorkspace,
    quickStartSession,
    recheckDependencies,
  } = useOrchestrator();

  const [view, setView] = useState<View>({ page: 'home' });

  // Auto-switch to session when one starts
  useEffect(() => {
    if (session && view.page !== 'session') {
      setView({ page: 'session' });
    }
  }, [session]);

  // Handle shutdown on close (keep at App level for beforeunload)
  const shutdownServer = useCallback(() => {
    if (port) {
      navigator.sendBeacon(`http://localhost:${port}/api/shutdown`, '');
    }
  }, [port]);

  useEffect(() => {
    const shutdownOnClose = localStorage.getItem('orchy-shutdown-on-close') === 'true';

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (shutdownOnClose && session) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    const handleUnload = () => {
      if (shutdownOnClose) {
        shutdownServer();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, [session, shutdownServer]);

  // Show splash screen while checking dependencies
  if (checkingDependencies || backendError || (dependencyCheck && !dependencyCheck.claude.available)) {
    return (
      <SplashScreen
        checking={checkingDependencies}
        dependencyCheck={dependencyCheck}
        backendError={backendError}
        onRetry={recheckDependencies}
      />
    );
  }

  const goHome = () => {
    setView({ page: 'home' });
  };

  const handleStartFromWorkspace = (feature: string, workspaceId: string, branchName?: string) => {
    const workspace = workspaces[workspaceId];
    if (workspace) {
      startSession(feature, workspace.projects, branchName, workspaceId);
    }
  };

  const handleCreateWorkspace = (name: string, projectNames: string[], context?: string) => {
    createWorkspace(name, projectNames, context);
    setView({ page: 'home' });
  };

  switch (view.page) {
    case 'home':
      return (
        <HomePage
          workspaces={workspaces}
          hasActiveSession={!!session}
          onSelectWorkspace={(id) => setView({ page: 'prompt', workspaceId: id })}
          onCreateWorkspace={() => setView({ page: 'createWorkspace' })}
          onSettings={() => setView({ page: 'settings' })}
          onResumeSession={() => setView({ page: 'session' })}
          onStartWithoutWorkspace={() => setView({ page: 'prompt-adhoc' })}
          onQuickStart={() => setView({ page: 'quickstart' })}
        />
      );

    case 'prompt': {
      const workspace = workspaces[view.workspaceId];
      if (!workspace) {
        setView({ page: 'home' });
        return null;
      }
      return (
        <PromptScreen
          workspace={workspace}
          projectConfigs={projects}
          startingSession={startingSession}
          onBack={goHome}
          onStart={handleStartFromWorkspace}
          onEditWorkspace={() => setView({ page: 'settings', tab: 'workspaces' })}
        />
      );
    }

    case 'prompt-adhoc':
      return (
        <AdHocPromptScreen
          availableProjects={Object.keys(projects)}
          projectConfigs={projects}
          startingSession={startingSession}
          onBack={goHome}
          onStart={(feature, selectedProjects, branchName) => {
            startSession(feature, selectedProjects, branchName);
          }}
        />
      );

    case 'quickstart':
      return (
        <QuickStartView
          templates={templates.map(t => ({
            name: t.name,
            displayName: t.displayName,
            description: t.description,
          }))}
          creatingProject={creatingProject || startingSession}
          onBack={goHome}
          onStart={(appName, feature, selectedTemplates) => {
            quickStartSession(appName, feature, selectedTemplates);
          }}
        />
      );

    case 'createWorkspace':
      return (
        <CreateWorkspaceView
          availableProjects={Object.keys(projects)}
          onBack={goHome}
          onCreate={handleCreateWorkspace}
          onOpenAddProject={() => setView({ page: 'settings', tab: 'projects' })}
        />
      );

    case 'settings':
      return (
        <SettingsPage
          initialTab={view.tab}
          onBack={goHome}
        />
      );

    case 'session':
      return <SessionView onBackToHome={goHome} />;
  }
}

export default App;
