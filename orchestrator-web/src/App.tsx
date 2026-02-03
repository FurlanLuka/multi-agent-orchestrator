import { useEffect, useState } from 'react';
import { MemoryRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { useOrchestrator } from './context/OrchestratorContext';
import { SplashScreen } from './components/SplashScreen';
import { SecondaryTabScreen } from './components/SecondaryTabScreen';
import { HomePage } from './components/home/HomePage';
import { PromptScreen } from './components/home/PromptScreen';
import { CreateWorkspaceView } from './components/home/CreateWorkspaceView';
import { SessionView } from './components/session/SessionView';
import { HistoricalSessionView } from './components/session/HistoricalSessionView';
import { ModeSelectionPage } from './pages/ModeSelectionPage';
import { DesignSessionPage } from './pages/DesignSessionPage';
import { DesignsLibraryPage } from './pages/DesignsLibraryPage';
import { BackButton } from './components/BackButton';
import { DevServerPanel, PortConflictModal, DevServerLogsModal } from './components/devserver';
import type { WorkspaceConfig, ProjectConfig, WorkspaceProjectConfig, ProjectTemplate } from '@orchy/types';

// Wrapper component that handles routing logic
function AppRoutes() {
  const {
    clientRole,
    secondaryMessage,
    checkingDependencies,
    dependencyCheck,
    backendError,
    session,
    templates,
    workspaces,
    creatingProject,
    addingProject,
    startingSession,
    quickStartError,
    port,
    startSession,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    createWorkspaceFromTemplate,
    createdWorkspaceId,
    clearCreatedWorkspaceId,
    clearQuickStartError,
    recheckDependencies,
    branchCheckResult,
    checkingBranches,
    checkoutingBranches,
    checkBranchStatus,
    checkoutMainBranch,
    clearBranchCheckResult,
    addProjectToWorkspace,
    updateWorkspaceProject,
    removeProjectFromWorkspace,
    createProjectFromTemplateForWorkspace,
    createProjectError,
    clearCreateProjectError,
    resumeSession,
  } = useOrchestrator();

  const navigate = useNavigate();

  // Auto-navigate to session when one starts
  useEffect(() => {
    if (session) {
      navigate('/session');
    }
  }, [session, navigate]);

  // Auto-navigate to prompt screen when workspace is created from template
  useEffect(() => {
    if (createdWorkspaceId) {
      navigate(`/prompt/${createdWorkspaceId}`);
      clearCreatedWorkspaceId();
    }
  }, [createdWorkspaceId, navigate, clearCreatedWorkspaceId]);

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
      // Get project names from workspace inline projects
      const projectNames = workspace.projects.map((p: WorkspaceProjectConfig) => p.name);
      startSession(feature, projectNames, branchName, workspaceId);
    }
  };

  const handleCreateEmptyWorkspace = (name: string, context?: string) => {
    createWorkspace(name, [], context);
    navigate('/home');
  };

  const handleCreateFromTemplate = (appName: string, selectedTemplates: string[], context?: string, designName?: string) => {
    createWorkspaceFromTemplate(appName, selectedTemplates, context, designName);
    // Navigation happens via useEffect when createdWorkspaceId is set
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
              onResumeSession={() => navigate('/session')}
              onDeleteWorkspace={deleteWorkspace}
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
            templates={templates}
            startingSession={startingSession}
            branchCheckResult={branchCheckResult}
            checkingBranches={checkingBranches}
            checkoutingBranches={checkoutingBranches}
            addingProject={addingProject}
            creatingProject={creatingProject}
            gitAvailable={dependencyCheck?.git.available ?? true}
            port={port}
            onStart={handleStartFromWorkspace}
            onCheckBranchStatus={checkBranchStatus}
            onCheckoutMainBranch={checkoutMainBranch}
            onClearBranchCheck={clearBranchCheckResult}
            onAddProjectToWorkspace={addProjectToWorkspace}
            onUpdateWorkspaceProject={updateWorkspaceProject}
            onRemoveProjectFromWorkspace={removeProjectFromWorkspace}
            onUpdateWorkspace={updateWorkspace}
            onCreateProjectFromTemplate={createProjectFromTemplateForWorkspace}
            createProjectError={createProjectError}
            onClearCreateProjectError={clearCreateProjectError}
            onResumeSession={resumeSession}
          />
        }
      />
      <Route
        path="/create-workspace"
        element={
          <>
            <BackButton to="/home" />
            <CreateWorkspaceView
              creatingProject={creatingProject}
              port={port}
              error={quickStartError}
              onClearError={clearQuickStartError}
              onBack={() => navigate('/home')}
              onCreateEmpty={handleCreateEmptyWorkspace}
              onCreateFromTemplate={handleCreateFromTemplate}
              onGoToDesigner={() => navigate('/design-session')}
            />
          </>
        }
      />
      <Route
        path="/session"
        element={<SessionView onBackToHome={() => navigate('/home')} />}
      />
      <Route
        path="/session/:sessionId/history"
        element={<HistoricalSessionView />}
      />
    </Routes>
  );
}

// Wrapper for PromptScreen to handle workspaceId param
function PromptScreenWrapper({
  workspaces,
  templates,
  startingSession,
  branchCheckResult,
  checkingBranches,
  checkoutingBranches,
  addingProject,
  creatingProject,
  gitAvailable,
  port,
  onStart,
  onCheckBranchStatus,
  onCheckoutMainBranch,
  onClearBranchCheck,
  onAddProjectToWorkspace,
  onUpdateWorkspaceProject,
  onRemoveProjectFromWorkspace,
  onUpdateWorkspace,
  onCreateProjectFromTemplate,
  createProjectError,
  onClearCreateProjectError,
  onResumeSession,
}: {
  workspaces: Record<string, WorkspaceConfig>;
  templates: any[];
  startingSession: boolean;
  branchCheckResult: Array<{
    project: string;
    gitEnabled: boolean;
    currentBranch: string | null;
    mainBranch: string;
    isOnMainBranch: boolean;
    hasUncommittedChanges: boolean;
    uncommittedDetails?: { staged: number; unstaged: number; untracked: number };
  }> | null;
  checkingBranches: boolean;
  checkoutingBranches: boolean;
  addingProject: boolean;
  creatingProject: boolean;
  gitAvailable: boolean;
  port: number | null;
  onStart: (feature: string, workspaceId: string, branchName?: string) => void;
  onCheckBranchStatus: (projects: string[]) => void;
  onCheckoutMainBranch: (projects: string[], stashFirst?: boolean) => void;
  onClearBranchCheck: () => void;
  onAddProjectToWorkspace: (workspaceId: string, project: WorkspaceProjectConfig) => void;
  onUpdateWorkspaceProject: (workspaceId: string, projectName: string, updates: Partial<ProjectConfig>) => void;
  onRemoveProjectFromWorkspace: (workspaceId: string, projectName: string) => void;
  onUpdateWorkspace: (id: string, updates: { name?: string; context?: string }) => void;
  onCreateProjectFromTemplate: (workspaceId: string, options: { name: string; targetPath: string; template: ProjectTemplate; permissions?: { dangerouslyAllowAll?: boolean; allow: string[] } }) => void;
  createProjectError: string | null;
  onClearCreateProjectError: () => void;
  onResumeSession: (sessionId: string) => void;
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

  // Derive projectConfigs from workspace inline projects
  const projectConfigs: Record<string, ProjectConfig> = {};
  for (const proj of workspace.projects) {
    const { name, ...config } = proj;
    projectConfigs[name] = config;
  }

  // Check if workspace is empty (no projects) - will force edit mode
  const isEmptyWorkspace = workspace.projects.length === 0;

  return (
    <>
      <BackButton to="/home" />
      <PromptScreen
        workspace={workspace}
        projectConfigs={projectConfigs}
        templates={templates}
        startingSession={startingSession}
        branchCheckResult={branchCheckResult}
        checkingBranches={checkingBranches}
        checkoutingBranches={checkoutingBranches}
        addingProject={addingProject}
        creatingProject={creatingProject}
        gitAvailable={gitAvailable}
        port={port}
        forceEditMode={isEmptyWorkspace}
        onBack={() => navigate('/home')}
        onStart={onStart}
        onCheckBranchStatus={onCheckBranchStatus}
        onCheckoutMainBranch={onCheckoutMainBranch}
        onClearBranchCheck={onClearBranchCheck}
        onSelectHistoricalSession={(sessionId) => navigate(`/session/${sessionId}/history`)}
        onResumeSession={onResumeSession}
        onAddProjectToWorkspace={onAddProjectToWorkspace}
        onUpdateWorkspaceProject={onUpdateWorkspaceProject}
        onRemoveProjectFromWorkspace={onRemoveProjectFromWorkspace}
        onUpdateWorkspace={onUpdateWorkspace}
        onCreateProjectFromTemplate={(options) => onCreateProjectFromTemplate(workspace.id, options)}
        createProjectError={createProjectError}
        onClearCreateProjectError={onClearCreateProjectError}
      />
    </>
  );
}

/**
 * Overlay component for dev server UI elements.
 * Renders floating panel, port conflict modal, and logs modal.
 * Persists across all routes.
 */
function DevServerOverlay() {
  const {
    devServers,
    devServerLogs,
    portConflicts,
    showPortConflictModal,
    stopDevServer,
    stopAllDevServers,
    restartDevServer,
    killPortProcess,
    forceStartDevServers,
    closePortConflictModal,
    getDevServerLogs,
    devServerWorkspaceId,
  } = useOrchestrator();

  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [logsProject, setLogsProject] = useState<string | null>(null);

  const handleViewLogs = (project: string) => {
    setLogsProject(project);
    setLogsModalOpen(true);
  };

  const handleCloseLogsModal = () => {
    setLogsModalOpen(false);
    setLogsProject(null);
  };

  const handleKillAllAndStart = () => {
    // Kill all conflicting ports then start
    const conflictingPorts = portConflicts.filter(c => c.inUse).map(c => c.port);
    conflictingPorts.forEach(port => killPortProcess(port));
    // After killing, force start (backend handles waiting)
    if (devServerWorkspaceId) {
      forceStartDevServers(devServerWorkspaceId);
    }
    closePortConflictModal();
  };

  const handleSkipConflicting = () => {
    // Start only non-conflicting servers
    if (devServerWorkspaceId) {
      const nonConflicting = portConflicts.filter(c => !c.inUse).map(c => c.project);
      if (nonConflicting.length > 0) {
        forceStartDevServers(devServerWorkspaceId, nonConflicting);
      }
    }
    closePortConflictModal();
  };

  // Get the current server and its logs for the logs modal
  const currentServer = logsProject ? devServers.find(s => s.project === logsProject) || null : null;
  const currentLogs = logsProject ? (devServerLogs[logsProject] || []) : [];

  return (
    <>
      <DevServerPanel
        servers={devServers}
        onStop={stopDevServer}
        onStopAll={stopAllDevServers}
        onRestart={restartDevServer}
        onViewLogs={handleViewLogs}
      />

      <PortConflictModal
        opened={showPortConflictModal}
        conflicts={portConflicts}
        onClose={closePortConflictModal}
        onKillPort={killPortProcess}
        onSkipConflicting={handleSkipConflicting}
        onKillAllAndStart={handleKillAllAndStart}
      />

      <DevServerLogsModal
        opened={logsModalOpen}
        server={currentServer}
        logs={currentLogs}
        onClose={handleCloseLogsModal}
        onRestart={restartDevServer}
        onRefreshLogs={getDevServerLogs}
      />
    </>
  );
}

function App() {
  return (
    <MemoryRouter>
      <AppRoutes />
      <DevServerOverlay />
    </MemoryRouter>
  );
}

export default App;
