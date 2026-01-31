import { useState, useEffect } from 'react';
import { useOrchestrator } from './context/OrchestratorContext';
import { SplashScreen } from './components/SplashScreen';
import { SecondaryTabScreen } from './components/SecondaryTabScreen';
import { HomePage } from './components/home/HomePage';
import { PromptScreen } from './components/home/PromptScreen';
import { CreateWorkspaceView } from './components/home/CreateWorkspaceView';
import { AdHocPromptScreen } from './components/home/AdHocPromptScreen';
import { QuickStartView } from './components/home/QuickStartView';
import { SettingsPage } from './components/settings/SettingsPage';
import { SessionView } from './components/session/SessionView';
import { ModeSelectionPage } from './pages/ModeSelectionPage';
import { DesignSessionPage } from './pages/DesignSessionPage';
import { DesignsLibraryPage } from './pages/DesignsLibraryPage';
import type { SettingsTab } from './components/settings/SettingsSidebar';

type View =
  | { page: 'home' }
  | { page: 'mode-selection' }
  | { page: 'designs-library' }
  | { page: 'design-session' }
  | { page: 'prompt'; workspaceId: string }
  | { page: 'prompt-adhoc' }
  | { page: 'quickstart' }
  | { page: 'createWorkspace' }
  | { page: 'settings'; tab?: SettingsTab }
  | { page: 'session' };

function App() {
  const {
    clientRole,
    secondaryMessage,
    checkingDependencies,
    dependencyCheck,
    backendError,
    session,
    projects,
    workspaces,
    creatingProject,
    startingSession,
    startSession,
    createWorkspace,
    quickStartSession,
    recheckDependencies,
  } = useOrchestrator();

  const [view, setView] = useState<View>({ page: 'mode-selection' });

  // Auto-switch to session when one starts
  useEffect(() => {
    if (session && view.page !== 'session') {
      setView({ page: 'session' });
    }
  }, [session]);

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

  // Show secondary tab screen if another tab is the main client (production only)
  if (clientRole === 'secondary') {
    return <SecondaryTabScreen message={secondaryMessage || 'UI is active on another tab'} />;
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
          onStartWithoutWorkspace={() => setView({ page: 'mode-selection' })}
          onQuickStart={() => setView({ page: 'quickstart' })}
        />
      );

    case 'mode-selection':
      return (
        <ModeSelectionPage
          hasActiveSession={!!session}
          onSelectDesign={() => setView({ page: 'designs-library' })}
          onSelectBuild={() => setView({ page: 'home' })}
          onResumeSession={() => setView({ page: 'session' })}
          onSettings={() => setView({ page: 'settings' })}
        />
      );

    case 'designs-library':
      return (
        <DesignsLibraryPage
          onBack={() => setView({ page: 'mode-selection' })}
          onAddNew={() => setView({ page: 'design-session' })}
        />
      );

    case 'design-session':
      return (
        <DesignSessionPage
          onBack={() => setView({ page: 'designs-library' })}
          onComplete={() => setView({ page: 'designs-library' })}
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
          creatingProject={creatingProject || startingSession}
          onBack={goHome}
          onStart={(appName, feature, selectedTemplates, designName) => {
            quickStartSession(appName, feature, selectedTemplates, designName);
          }}
          onGoToDesigner={() => setView({ page: 'design-session' })}
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
