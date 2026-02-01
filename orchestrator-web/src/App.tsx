import { useEffect } from 'react';
import { MemoryRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
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
import { BackButton } from './components/BackButton';

// Wrapper component that handles routing logic
function AppRoutes() {
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
    branchCheckResult,
    checkingBranches,
    checkoutingBranches,
    checkBranchStatus,
    checkoutMainBranch,
    clearBranchCheckResult,
  } = useOrchestrator();

  const navigate = useNavigate();

  // Auto-navigate to session when one starts
  useEffect(() => {
    if (session) {
      navigate('/session');
    }
  }, [session, navigate]);

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

  const handleStartFromWorkspace = (feature: string, workspaceId: string, branchName?: string) => {
    const workspace = workspaces[workspaceId];
    if (workspace) {
      startSession(feature, workspace.projects, branchName, workspaceId);
    }
  };

  const handleCreateWorkspace = (name: string, projectNames: string[], context?: string) => {
    createWorkspace(name, projectNames, context);
    navigate('/home');
  };

  return (
    <Routes>
      <Route
        path="/"
        element={
          <ModeSelectionPage
            hasActiveSession={!!session}
            onSelectDesign={() => navigate('/designs-library')}
            onSelectBuild={() => navigate('/home')}
            onResumeSession={() => navigate('/session')}
            onSettings={() => navigate('/settings')}
          />
        }
      />
      <Route
        path="/home"
        element={
          <>
            <BackButton to="/" />
            <HomePage
              workspaces={workspaces}
              hasActiveSession={!!session}
              onSelectWorkspace={(id) => navigate(`/prompt/${id}`)}
              onCreateWorkspace={() => navigate('/create-workspace')}
              onSettings={() => navigate('/settings')}
              onResumeSession={() => navigate('/session')}
              onStartWithoutWorkspace={() => navigate('/')}
              onQuickStart={() => navigate('/quickstart')}
            />
          </>
        }
      />
      <Route
        path="/designs-library"
        element={
          <>
            <BackButton to="/" />
            <DesignsLibraryPage
              onAddNew={() => navigate('/design-session')}
            />
          </>
        }
      />
      <Route
        path="/design-session"
        element={
          <DesignSessionPage
            onBack={() => navigate('/designs-library')}
            onComplete={() => navigate('/designs-library')}
          />
        }
      />
      <Route
        path="/prompt/:workspaceId"
        element={
          <PromptScreenWrapper
            workspaces={workspaces}
            projects={projects}
            startingSession={startingSession}
            branchCheckResult={branchCheckResult}
            checkingBranches={checkingBranches}
            checkoutingBranches={checkoutingBranches}
            onStart={handleStartFromWorkspace}
            onCheckBranchStatus={checkBranchStatus}
            onCheckoutMainBranch={checkoutMainBranch}
            onClearBranchCheck={clearBranchCheckResult}
          />
        }
      />
      <Route
        path="/prompt-adhoc"
        element={
          <>
            <BackButton to="/home" />
            <AdHocPromptScreen
              availableProjects={Object.keys(projects)}
              projectConfigs={projects}
              startingSession={startingSession}
              onBack={() => navigate('/home')}
              onStart={(feature, selectedProjects, branchName) => {
                startSession(feature, selectedProjects, branchName);
              }}
            />
          </>
        }
      />
      <Route
        path="/quickstart"
        element={
          <>
            <BackButton to="/home" />
            <QuickStartView
              creatingProject={creatingProject || startingSession}
              onBack={() => navigate('/home')}
              onStart={(appName, feature, selectedTemplates, designName) => {
                quickStartSession(appName, feature, selectedTemplates, designName);
              }}
              onGoToDesigner={() => navigate('/design-session')}
            />
          </>
        }
      />
      <Route
        path="/create-workspace"
        element={
          <>
            <BackButton to="/home" />
            <CreateWorkspaceView
              availableProjects={Object.keys(projects)}
              onBack={() => navigate('/home')}
              onCreate={handleCreateWorkspace}
              onOpenAddProject={() => navigate('/settings/projects')}
            />
          </>
        }
      />
      <Route
        path="/settings"
        element={
          <>
            <BackButton to="/home" />
            <SettingsPage />
          </>
        }
      />
      <Route
        path="/settings/:tab"
        element={
          <>
            <BackButton to="/home" />
            <SettingsPage />
          </>
        }
      />
      <Route
        path="/session"
        element={<SessionView onBackToHome={() => navigate('/home')} />}
      />
    </Routes>
  );
}

// Wrapper for PromptScreen to handle workspaceId param
function PromptScreenWrapper({
  workspaces,
  projects,
  startingSession,
  branchCheckResult,
  checkingBranches,
  checkoutingBranches,
  onStart,
  onCheckBranchStatus,
  onCheckoutMainBranch,
  onClearBranchCheck,
}: {
  workspaces: Record<string, any>;
  projects: Record<string, any>;
  startingSession: boolean;
  branchCheckResult: Array<{
    project: string;
    gitEnabled: boolean;
    currentBranch: string | null;
    mainBranch: string;
    isOnMainBranch: boolean;
  }> | null;
  checkingBranches: boolean;
  checkoutingBranches: boolean;
  onStart: (feature: string, workspaceId: string, branchName?: string) => void;
  onCheckBranchStatus: (projects: string[]) => void;
  onCheckoutMainBranch: (projects: string[]) => void;
  onClearBranchCheck: () => void;
}) {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspace = workspaceId ? workspaces[workspaceId] : null;

  useEffect(() => {
    if (!workspace) {
      navigate('/home');
    }
  }, [workspace, navigate]);

  if (!workspace) return null;

  return (
    <>
      <BackButton to="/home" />
      <PromptScreen
        workspace={workspace}
        projectConfigs={projects}
        startingSession={startingSession}
        branchCheckResult={branchCheckResult}
        checkingBranches={checkingBranches}
        checkoutingBranches={checkoutingBranches}
        onBack={() => navigate('/home')}
        onStart={onStart}
        onEditWorkspace={() => navigate('/settings/workspaces')}
        onCheckBranchStatus={onCheckBranchStatus}
        onCheckoutMainBranch={onCheckoutMainBranch}
        onClearBranchCheck={onClearBranchCheck}
      />
    </>
  );
}

function App() {
  return (
    <MemoryRouter>
      <AppRoutes />
    </MemoryRouter>
  );
}

export default App;
