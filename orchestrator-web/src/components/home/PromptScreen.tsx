import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Stack,
  Text,
  Title,
  Button,
  ActionIcon,
  Group,
  Loader,
  Badge,
  Tooltip,
  Box,
  Modal,
  ThemeIcon,
  Switch,
  Alert,
  Select,
  SimpleGrid,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconRocket,
  IconPlus,
  IconEdit,
  IconTrash,
  IconCheck,
  IconPlayerPlay,
  IconServer,
  IconAlertTriangle,
  IconGitMerge,
  IconBrandGithub,
  IconHammer,
  IconHistory,
  IconCloudUpload,
} from '@tabler/icons-react';
import type {
  WorkspaceConfig,
  ProjectConfig,
  SessionProjectConfig,
  WorkspaceProjectConfig,
  ProjectTemplateConfig,
  ProjectTemplate,
  GitHubConfig,
  GitHubGlobalSettings,
} from '@orchy/types';
import {
  FormCard,
  GlassRichTextEditor,
  GlassTextarea,
  useGlassEditor,
  GlassCard,
} from '../../theme';
import { BranchCheckModal } from './BranchCheckModal';
import { SessionHistoryList } from './SessionHistoryList';
import { AddProjectModal } from '../AddProjectModal';
import type { AddProjectOptions, CreateProjectOptions } from '../AddProjectModal';
import { EditProjectModal } from '../EditProjectModal';
import { HelpOverlay, HelpTrigger } from '../overlay';
import { BackButton } from '../BackButton';
import type { PermissionsConfig } from '../CollapsiblePermissions';
import { useOrchestrator } from '../../context/OrchestratorContext';
import { DeploymentTab } from './DeploymentTab';

type WorkspaceView = 'home' | 'feature' | 'deploy' | 'sessions';

interface BranchCheckResult {
  project: string;
  hasGitRepo: boolean;
  currentBranch: string | null;
  mainBranch: string;
  isOnMainBranch: boolean;
  hasUncommittedChanges: boolean;
  uncommittedDetails?: { staged: number; unstaged: number; untracked: number };
}

/* ── Main Component ──────────────────────────────────────── */

interface PromptScreenProps {
  workspace: WorkspaceConfig;
  projectConfigs: Record<string, ProjectConfig>;  // Global projects (for templates)
  templates: ProjectTemplateConfig[];
  startingSession: boolean;
  branchCheckResult: BranchCheckResult[] | null;
  checkingBranches: boolean;
  checkoutingBranches: boolean;
  addingProject: boolean;
  creatingProject: boolean;
  port: number | null;
  forceEditMode?: boolean;  // Force edit mode (e.g., for empty workspaces)
  onBack: () => void;
  onStart: (
    feature: string,
    workspaceId: string,
    branchName?: string,
    sessionProjectConfigs?: SessionProjectConfig[]
  ) => void;
  onCheckBranchStatus: (projects: string[]) => void;
  onCheckoutMainBranch: (projects: string[], stashFirst?: boolean) => void;
  onClearBranchCheck: () => void;
  onSelectHistoricalSession?: (sessionId: string) => void;
  onResumeSession?: (sessionId: string) => void;
  // Workspace project CRUD
  onAddProjectToWorkspace: (workspaceId: string, project: WorkspaceProjectConfig) => void;
  onUpdateWorkspaceProject: (workspaceId: string, projectName: string, updates: Partial<ProjectConfig>) => void;
  onRemoveProjectFromWorkspace: (workspaceId: string, projectName: string) => void;
  onUpdateWorkspace: (id: string, updates: { name?: string; context?: string; github?: GitHubConfig }) => void;
  onCreateProjectFromTemplate: (options: { name: string; targetPath: string; template: ProjectTemplate; permissions?: { dangerouslyAllowAll?: boolean; allow: string[] } }) => void;
  createProjectError?: string | null;
  onClearCreateProjectError?: () => void;
  onStartDeployment?: (provider: string, description: string, workspaceId: string) => void;
}

export function PromptScreen({
  workspace,
  projectConfigs: _globalProjectConfigs,
  templates,
  startingSession,
  branchCheckResult,
  checkingBranches,
  checkoutingBranches,
  addingProject,
  creatingProject,
  port,
  forceEditMode = false,
  onBack,
  onStart,
  onCheckBranchStatus,
  onCheckoutMainBranch,
  onClearBranchCheck,
  onSelectHistoricalSession,
  onResumeSession,
  onAddProjectToWorkspace,
  onUpdateWorkspaceProject,
  onRemoveProjectFromWorkspace,
  onUpdateWorkspace,
  onCreateProjectFromTemplate,
  createProjectError,
  onClearCreateProjectError,
  onStartDeployment,
}: PromptScreenProps) {
  const { startDevServers, devServers, startingDevServers, stopAllDevServers } = useOrchestrator();
  const [view, setView] = useState<WorkspaceView>('home');
  // Branch name is auto-generated for orchyManaged workspaces
  const [branchName] = useState('');

  // GitHub verification state
  const [githubStatus, setGithubStatus] = useState<{
    checking: boolean;
    authenticated: boolean;
    username?: string;
    hasAccess: boolean;
    error?: string;
  }>({ checking: false, authenticated: true, hasAccess: true });
  const [sessionProjectConfigs, setSessionProjectConfigs] = useState<SessionProjectConfig[]>([]);
  const [hasCompletedSession, setHasCompletedSession] = useState(false);
  // Check if workspace has projects (used to prevent exiting edit mode when empty)
  const hasProjects = workspace.projects.length > 0;

  // Check if workspace has any projects with dev servers configured
  const hasDevServerProjects = workspace.projects.some(
    p => p.devServerEnabled !== false && p.devServer?.command
  );

  // Check if dev servers are already running for this workspace
  const hasRunningDevServers = devServers.some(
    s => workspace.projects.some(p => p.name === s.project) &&
      (s.status === 'running' || s.status === 'starting')
  );

  const handleStartDevServers = () => {
    startDevServers(workspace.id);
  };

  // Start in edit mode if forceEditMode is true (empty workspace)
  const [isEditMode, setIsEditMode] = useState(forceEditMode || !hasProjects);

  // Force edit mode if workspace becomes empty (all projects removed)
  useEffect(() => {
    if (!hasProjects && !isEditMode) {
      setIsEditMode(true);
    }
  }, [hasProjects, isEditMode]);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [contextValue, setContextValue] = useState(workspace.context || '');
  const [permissionsConfig, setPermissionsConfig] = useState<PermissionsConfig | null>(null);

  // GitHub settings state for edit mode
  const [githubGlobalSettings, setGithubGlobalSettings] = useState<(GitHubGlobalSettings & { ghInstalled?: boolean }) | null>(null);
  const [githubEnabled, setGithubEnabled] = useState(workspace.github?.enabled || false);
  const [githubVisibility, setGithubVisibility] = useState<'private' | 'public'>(workspace.github?.visibility || 'private');
  const [githubOwnerType, setGithubOwnerType] = useState<'user' | 'org'>(workspace.github?.ownerType || 'user');
  const [githubOrg, setGithubOrg] = useState(workspace.github?.owner || '');
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [githubOrgs, setGithubOrgs] = useState<string[]>([]);

  // Modal states
  const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [devServerWarningOpened, { open: openDevServerWarning, close: closeDevServerWarning }] = useDisclosure(false);

  // Store pending start params while showing branch check modal
  const [pendingStartParams, setPendingStartParams] = useState<{
    feature: string;
    workspaceId: string;
    branchName?: string;
    includedConfigs: SessionProjectConfig[];
  } | null>(null);

  const [editorContent, setEditorContent] = useState('');
  const editor = useGlassEditor({
    placeholder: 'Describe what to build...',
    onUpdate: (text) => setEditorContent(text),
  });

  const effectivePort = port ?? (window as unknown as { __ORCHESTRATOR_PORT__?: number }).__ORCHESTRATOR_PORT__ ?? 3456;

  // Check if workspace has at least one completed session (required for Deploy)
  useEffect(() => {
    fetch(`http://localhost:${effectivePort}/api/workspaces/${workspace.id}/sessions`)
      .then(res => res.json())
      .then((data: Array<{ completionReason?: string }>) => {
        setHasCompletedSession(data.some(s => s.completionReason === 'all_completed'));
      })
      .catch(() => setHasCompletedSession(false));
  }, [workspace.id, effectivePort]);

  // Deploy card is available when workspace is orchyManaged with GitHub enabled and has completed sessions
  const showDeployCard = !!workspace.orchyManaged && !!workspace.github?.enabled && !!onStartDeployment && hasCompletedSession;

  // Fetch permissions config
  useEffect(() => {
    if (effectivePort === null) return;

    fetch(`http://localhost:${effectivePort}/api/permissions`)
      .then(res => res.json())
      .then(data => setPermissionsConfig(data))
      .catch(err => console.error('Failed to fetch permissions config:', err));
  }, [effectivePort]);

  // Fetch GitHub global settings and user info for edit mode (Orchy managed workspaces)
  useEffect(() => {
    if (!workspace.orchyManaged || effectivePort === null) return;

    // Fetch GitHub global settings
    fetch(`http://localhost:${effectivePort}/api/github/settings`)
      .then(res => res.json())
      .then(data => {
        setGithubGlobalSettings(data);
        // Set defaults from global settings if workspace doesn't have GitHub config yet
        if (!workspace.github) {
          if (data.defaultVisibility) setGithubVisibility(data.defaultVisibility);
          if (data.defaultOwnerType) setGithubOwnerType(data.defaultOwnerType);
          if (data.defaultOwner) setGithubOrg(data.defaultOwner);
        }
      })
      .catch(err => console.error('Failed to fetch GitHub settings:', err));

    // Fetch authenticated user info
    fetch(`http://localhost:${effectivePort}/api/github/user`)
      .then(res => res.json())
      .then(data => {
        if (data.username) {
          setGithubUsername(data.username);
        }
        if (data.orgs) {
          setGithubOrgs(data.orgs);
        }
      })
      .catch(err => console.error('Failed to fetch GitHub user:', err));
  }, [workspace.orchyManaged, workspace.github, effectivePort]);

  // Verify GitHub access for workspaces with GitHub enabled
  useEffect(() => {
    if (!workspace.orchyManaged || !workspace.github?.enabled || !workspace.github?.repo) {
      return;
    }

    setGithubStatus(prev => ({ ...prev, checking: true }));

    fetch(`http://localhost:${effectivePort}/api/github/verify?repo=${encodeURIComponent(workspace.github.repo)}`)
      .then(res => res.json())
      .then(data => {
        setGithubStatus({
          checking: false,
          authenticated: data.authenticated,
          username: data.username,
          hasAccess: data.hasAccess,
          error: data.error,
        });
      })
      .catch(err => {
        console.error('Failed to verify GitHub access:', err);
        setGithubStatus({
          checking: false,
          authenticated: false,
          hasAccess: false,
          error: 'Failed to verify GitHub access',
        });
      });
  }, [workspace.orchyManaged, workspace.github, effectivePort]);

  // Build project configs from workspace inline projects
  const workspaceProjectConfigs: Record<string, ProjectConfig> = {};
  for (const project of workspace.projects) {
    const { name, ...config } = project;
    workspaceProjectConfigs[name] = config;
  }

  // Initialize session project configs when workspace changes
  useEffect(() => {
    const configs = workspace.projects.map(p => ({
      name: p.name,
      included: true,
      readOnly: false,
    }));
    setSessionProjectConfigs(configs);
  }, [workspace.projects]);

  // Sync context and git settings when workspace changes
  useEffect(() => {
    setContextValue(workspace.context || '');
  }, [workspace.context]);

  // Git features are only available for orchyManaged workspaces
  const isOrchyManaged = workspace.orchyManaged === true;

  const hasContent = editorContent.trim().length > 0;

  // For orchyManaged workspaces, all projects share the workspace git
  const getIncludedProjects = useCallback(() => {
    return sessionProjectConfigs
      .filter(c => c.included)
      .map(c => c.name);
  }, [sessionProjectConfigs]);

  const handleStart = () => {
    // Check if dev servers are running - must stop them first
    const hasRunningServers = devServers.some(
      s => s.status === 'running' || s.status === 'starting'
    );
    if (hasRunningServers) {
      openDevServerWarning();
      return;
    }

    const text = editor?.getText().trim();
    if (text) {
      // Filter to only included projects
      const includedConfigs = sessionProjectConfigs.filter(c => c.included);
      const includedProjects = getIncludedProjects();

      // For orchyManaged workspaces, check branch status first
      if (isOrchyManaged && includedProjects.length > 0) {
        setPendingStartParams({
          feature: text,
          workspaceId: workspace.id,
          branchName: branchName.trim() || undefined,
          includedConfigs,
        });
        onCheckBranchStatus(includedProjects);
      } else {
        // Non-orchyManaged workspaces: start immediately (no git features)
        onStart(
          text,
          workspace.id,
          undefined,
          includedConfigs
        );
      }
    }
  };

  const handleStopServersAndStart = () => {
    stopAllDevServers();
    closeDevServerWarning();
    // The user will need to click Start again after servers stop
  };

  // Handle branch check result
  useEffect(() => {
    if (branchCheckResult && pendingStartParams) {
      // Check if any projects are NOT on their main branch
      const hasProjectsOffMain = branchCheckResult.some(
        r => r.hasGitRepo && !r.isOnMainBranch && r.currentBranch
      );

      if (!hasProjectsOffMain) {
        // All projects are on main branch, proceed immediately
        onStart(
          pendingStartParams.feature,
          pendingStartParams.workspaceId,
          pendingStartParams.branchName,
          pendingStartParams.includedConfigs
        );
        setPendingStartParams(null);
        onClearBranchCheck();
      }
      // Otherwise, the modal will be shown
    }
  }, [branchCheckResult, pendingStartParams, onStart, onClearBranchCheck]);

  // Modal handlers
  const handleBranchCheckCancel = () => {
    setPendingStartParams(null);
    onClearBranchCheck();
  };

  const handleBranchCheckContinue = () => {
    if (pendingStartParams) {
      onStart(
        pendingStartParams.feature,
        pendingStartParams.workspaceId,
        pendingStartParams.branchName,
        pendingStartParams.includedConfigs
      );
      setPendingStartParams(null);
      onClearBranchCheck();
    }
  };

  const handleBranchCheckCheckout = (stashFirst: boolean) => {
    const includedProjects = getIncludedProjects();
    onCheckoutMainBranch(includedProjects, stashFirst);
  };

  // When checkout completes, start the session
  useEffect(() => {
    if (!checkoutingBranches && pendingStartParams && !branchCheckResult) {
      // Checkout just completed (branchCheckResult was cleared)
      onStart(
        pendingStartParams.feature,
        pendingStartParams.workspaceId,
        pendingStartParams.branchName,
        pendingStartParams.includedConfigs
      );
      setPendingStartParams(null);
    }
  }, [checkoutingBranches, pendingStartParams, branchCheckResult, onStart]);

  // Show modal when we have branch check results with projects off main
  const showBranchModal = branchCheckResult !== null && pendingStartParams !== null &&
    branchCheckResult.some(r => r.hasGitRepo && !r.isOnMainBranch && r.currentBranch);

  // Edit mode handlers
  const handleToggleEditMode = () => {
    if (isEditMode) {
      // Can't exit edit mode if workspace has no projects
      if (!hasProjects) {
        return;
      }
      // Exiting edit mode - save changes if any
      const updates: { context?: string; github?: GitHubConfig } = {};
      if (contextValue !== workspace.context) {
        updates.context = contextValue;
      }
      // Save GitHub settings for Orchy managed workspaces
      if (workspace.orchyManaged) {
        const currentGithub = workspace.github;
        const newGithubEnabled = githubEnabled;
        const newGithubVisibility = githubVisibility;
        const newGithubOwnerType = githubOwnerType;
        const newGithubOwner = githubOwnerType === 'org' ? githubOrg : githubUsername || undefined;

        // Check if GitHub config changed
        if (newGithubEnabled !== (currentGithub?.enabled || false) ||
            newGithubVisibility !== (currentGithub?.visibility || 'private') ||
            newGithubOwnerType !== (currentGithub?.ownerType || 'user') ||
            newGithubOwner !== currentGithub?.owner) {
          updates.github = {
            enabled: newGithubEnabled,
            visibility: newGithubVisibility,
            ownerType: newGithubOwnerType,
            owner: newGithubOwner,
          };
        }
      }
      if (Object.keys(updates).length > 0) {
        onUpdateWorkspace(workspace.id, updates);
      }
    }
    setIsEditMode(!isEditMode);
  };

  const handleEditProject = (projectName: string) => {
    setEditingProject(projectName);
    openEditModal();
  };

  const handleCloseEditModal = () => {
    closeEditModal();
    setEditingProject(null);
  };

  const handleSaveProject = (projectName: string, updates: Partial<ProjectConfig>) => {
    onUpdateWorkspaceProject(workspace.id, projectName, updates);
    handleCloseEditModal();
  };

  const handleDeleteProject = (projectName: string) => {
    onRemoveProjectFromWorkspace(workspace.id, projectName);
  };

  const handleAddProject = (options: AddProjectOptions) => {
    const project: WorkspaceProjectConfig = {
      name: options.name,
      path: options.path,
      devServerEnabled: options.devServerEnabled,
      devServer: options.devServer ? {
        command: options.devServer.command,
        readyPattern: options.devServer.readyPattern,
        env: options.devServer.env || {},
        url: options.devServer.url,
      } : undefined,
      buildEnabled: options.buildEnabled,
      buildCommand: options.buildCommand,
      installEnabled: options.installEnabled,
      installCommand: options.installCommand,
      setupCommand: options.setupCommand,
      hasE2E: options.hasE2E || false,
      e2eInstructions: options.e2eInstructions,
      dependsOn: options.dependsOn,
      mainBranch: options.mainBranch,
      permissions: options.permissions,
    };
    onAddProjectToWorkspace(workspace.id, project);
    closeAddModal();
  };

  // Create project from template and add to workspace
  const handleCreateProject = (options: CreateProjectOptions) => {
    onCreateProjectFromTemplate({
      name: options.name,
      targetPath: options.targetPath,
      template: options.template,
      permissions: options.permissions,
    });
  };

  /* ── Edit mode view ────────────────────────────────────── */

  if (isEditMode) {
    return (
      <>
      <BackButton onClick={onBack} />
      <Container size="md" pt={60} pb="xl">
        <Stack gap="xl">
          {/* Header */}
          <Stack gap={4}>
            <Group justify="space-between" align="center">
              <Title order={3} style={{ letterSpacing: '-.02em' }}>
                {workspace.name}
              </Title>
              <Button
                leftSection={<IconCheck size={16} />}
                onClick={handleToggleEditMode}
                disabled={!hasProjects}
              >
                Done Editing
              </Button>
            </Group>
            <Text c="dimmed" size="sm">
              {hasProjects
                ? 'Manage projects and settings for this workspace'
                : 'Add at least one project to continue'}
            </Text>
          </Stack>

          {/* Projects section */}
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={4}>Projects</Title>
              <Button
                size="sm"
                leftSection={<IconPlus size={14} />}
                onClick={openAddModal}
              >
                Add Project
              </Button>
            </Group>

            {workspace.projects.length > 0 ? (
              <Stack gap="xs">
                {workspace.projects.map((project) => (
                  <GlassCard key={project.name} p="sm">
                    <Group justify="space-between" wrap="nowrap">
                      <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                        <Text fw={500} truncate>{project.name}</Text>
                        <Text size="xs" c="dimmed" truncate>{project.path}</Text>
                      </Stack>
                      <Group gap="xs" wrap="nowrap">
                        {/* Feature badges */}
                        <Group gap={4} wrap="nowrap">
                          {project.devServerEnabled !== false && project.devServer && (
                            <Badge size="xs" variant="light" color="sage">Dev</Badge>
                          )}
                          {project.buildEnabled !== false && project.buildCommand && (
                            <Badge size="xs" variant="light" color="honey">Build</Badge>
                          )}
                          {project.hasE2E && (
                            <Badge size="xs" variant="light" color="peach">E2E</Badge>
                          )}
                        </Group>

                        {/* Action buttons */}
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconEdit size={12} />}
                          onClick={() => handleEditProject(project.name)}
                        >
                          Edit
                        </Button>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="rose"
                          onClick={() => handleDeleteProject(project.name)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </GlassCard>
                ))}
              </Stack>
            ) : (
              <GlassCard p="xl">
                <Stack align="center" gap="sm">
                  <Text c="dimmed" size="sm">No projects in this workspace</Text>
                  <Button
                    size="sm"
                    leftSection={<IconPlus size={14} />}
                    onClick={openAddModal}
                  >
                    Add Project
                  </Button>
                </Stack>
              </GlassCard>
            )}
          </Stack>

          {/* Context section */}
          <Stack gap="sm">
            <Title order={4}>Context</Title>
            <GlassTextarea
              placeholder="Add workspace context/rules for the planning agent (markdown supported)..."
              value={contextValue}
              onChange={(e) => setContextValue(e.target.value)}
              minRows={4}
              autosize
            />
            <Text size="xs" c="dimmed">
              This context will be prepended to every feature request in this workspace.
            </Text>
          </Stack>

          {/* Git Settings section - only for Orchy Managed workspaces */}
          {isOrchyManaged && (
            <Stack gap="sm">
              <Group gap="xs" align="center">
                <IconGitMerge size={18} style={{ color: 'var(--mantine-color-lavender-6)' }} />
                <Title order={4}>Git Settings</Title>
              </Group>
              <GlassCard p="md">
                <Box
                  p="sm"
                  style={{
                    background: 'rgba(183, 166, 234, 0.1)',
                    borderRadius: 8,
                    border: '1px solid rgba(183, 166, 234, 0.2)',
                  }}
                >
                  <Group gap="xs" mb={4}>
                    <Badge size="xs" variant="light" color="lavender">Orchy Managed</Badge>
                  </Group>
                  <Text size="xs" c="dimmed">
                    All projects share a single git repository at the workspace root. Branch names are generated automatically and changes are merged on completion.
                  </Text>
                </Box>
              </GlassCard>
            </Stack>
          )}

          {/* GitHub Integration section - only for Orchy managed workspaces */}
          {workspace.orchyManaged && githubGlobalSettings?.enabled && githubGlobalSettings?.ghInstalled && (
            <Stack gap="sm">
              <Group gap="xs" align="center">
                <IconBrandGithub size={18} style={{ color: 'var(--mantine-color-dark-6)' }} />
                <Title order={4}>GitHub Integration</Title>
              </Group>
              <GlassCard p="md">
                <Stack gap="md">
                  {/* Already connected info */}
                  {workspace.github?.repo ? (
                    <Box
                      p="sm"
                      style={{
                        background: 'rgba(74, 145, 73, 0.1)',
                        borderRadius: 8,
                        border: '1px solid rgba(74, 145, 73, 0.2)',
                      }}
                    >
                      <Group gap="xs" mb={4}>
                        <Badge size="xs" variant="light" color="sage">Connected</Badge>
                        <Badge size="sm" variant="light" color="dark">
                          {workspace.github.repo}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">
                        This workspace is connected to a GitHub repository. Changes will be pushed automatically.
                      </Text>
                    </Box>
                  ) : (
                    <>
                      {/* Enable GitHub toggle */}
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={2} style={{ flex: 1 }}>
                          <Text size="sm" fw={500}>Create GitHub Repository</Text>
                          <Text size="xs" c="dimmed">
                            Create a GitHub repo for this workspace. A repository will be created when you start your next session.
                          </Text>
                        </Stack>
                        <Switch
                          checked={githubEnabled}
                          onChange={(e) => setGithubEnabled(e.currentTarget.checked)}
                          color="dark"
                        />
                      </Group>

                      {githubEnabled && (
                        <Stack gap="sm" pl="md">
                          {/* Repo preview */}
                          <Group gap="xs">
                            <Text size="xs" c="dimmed">Repository:</Text>
                            <Badge size="sm" variant="light" color="dark">
                              {githubOwnerType === 'org' && githubOrg
                                ? `${githubOrg}/${workspace.name}`
                                : githubUsername
                                  ? `${githubUsername}/${workspace.name}`
                                  : workspace.name}
                            </Badge>
                          </Group>

                          {/* Visibility */}
                          <Group gap="xs">
                            <Text size="xs" c="dimmed" w={70}>Visibility:</Text>
                            <Button
                              size="xs"
                              variant={githubVisibility === 'private' ? 'filled' : 'light'}
                              color={githubVisibility === 'private' ? 'dark' : 'gray'}
                              onClick={() => setGithubVisibility('private')}
                            >
                              Private
                            </Button>
                            <Button
                              size="xs"
                              variant={githubVisibility === 'public' ? 'filled' : 'light'}
                              color={githubVisibility === 'public' ? 'dark' : 'gray'}
                              onClick={() => setGithubVisibility('public')}
                            >
                              Public
                            </Button>
                          </Group>

                          {/* Owner type */}
                          <Group gap="xs">
                            <Text size="xs" c="dimmed" w={70}>Owner:</Text>
                            <Button
                              size="xs"
                              variant={githubOwnerType === 'user' ? 'filled' : 'light'}
                              color={githubOwnerType === 'user' ? 'dark' : 'gray'}
                              onClick={() => setGithubOwnerType('user')}
                            >
                              Personal
                            </Button>
                            <Button
                              size="xs"
                              variant={githubOwnerType === 'org' ? 'filled' : 'light'}
                              color={githubOwnerType === 'org' ? 'dark' : 'gray'}
                              onClick={() => setGithubOwnerType('org')}
                              disabled={githubOrgs.length === 0}
                            >
                              Organization
                            </Button>
                          </Group>

                          {/* Organization select */}
                          {githubOwnerType === 'org' && githubOrgs.length > 0 && (
                            <Group gap="xs">
                              <Text size="xs" c="dimmed" w={70}>Org:</Text>
                              <Select
                                size="xs"
                                placeholder="Select organization"
                                data={githubOrgs.map(org => ({ value: org, label: org }))}
                                value={githubOrg}
                                onChange={(val) => setGithubOrg(val || '')}
                                style={{ flex: 1, maxWidth: 200 }}
                              />
                            </Group>
                          )}
                        </Stack>
                      )}
                    </>
                  )}
                </Stack>
              </GlassCard>
            </Stack>
          )}
        </Stack>

        {/* Add Project Modal */}
        <AddProjectModal
          opened={addModalOpened}
          onClose={closeAddModal}
          templates={templates}
          projects={workspaceProjectConfigs}
          creatingProject={creatingProject}
          addingProject={addingProject}
          port={effectivePort}
          permissionsConfig={permissionsConfig}
          createProjectError={createProjectError}
          onClearCreateProjectError={onClearCreateProjectError}
          onCreateProject={handleCreateProject}
          onAddProject={handleAddProject}
          orchyManaged={workspace.orchyManaged}
        />

        {/* Edit Project Modal */}
        <EditProjectModal
          opened={editModalOpened}
          onClose={handleCloseEditModal}
          projectName={editingProject}
          projectConfig={editingProject ? workspaceProjectConfigs[editingProject] : null}
          projects={workspaceProjectConfigs}
          permissionsConfig={permissionsConfig}
          onSave={handleSaveProject}
        />
      </Container>
      </>
    );
  }

  /* ── Home view ─────────────────────────────────────────── */

  if (view === 'home') {
    return (
      <>
      <BackButton onClick={onBack} />
      <Container size="md" pt={60} pb="xl">
        <Stack gap="xl">
          {/* Header */}
          <Stack gap={0}>
            <Group justify="space-between" align="center">
              <Group gap="xs" align="center">
                <Title order={3} style={{ letterSpacing: '-.02em' }}>
                  {workspace.name}
                </Title>
                <Tooltip label="Edit workspace">
                  <ActionIcon variant="subtle" color="gray" size="sm" onClick={handleToggleEditMode}>
                    <IconEdit size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>

              <Group gap="sm">
                {hasDevServerProjects && (
                  <Button
                    variant="light"
                    color="sage"
                    size="sm"
                    leftSection={<IconServer size={16} />}
                    onClick={handleStartDevServers}
                    loading={startingDevServers}
                    disabled={hasRunningDevServers || startingDevServers}
                  >
                    {hasRunningDevServers ? 'Dev Servers Running' : 'Run Dev Servers'}
                  </Button>
                )}
              </Group>
            </Group>
            <Group gap="xs">
              <Text c="dimmed" size="sm">
                Choose what you'd like to do
              </Text>
              <Text c="dimmed" size="sm">·</Text>
              <HelpOverlay
                trigger={<HelpTrigger />}
                title="Workspace Overview"
                icon={<IconHammer size={20} style={{ color: 'var(--mantine-color-lavender-5)' }} />}
                maxWidth={520}
              >
                <Stack gap="md">
                  <Box>
                    <Text fw={600} size="sm" mb={4}>What is a workspace?</Text>
                    <Text size="sm" c="dimmed">
                      A workspace groups your projects together. From here you can plan new features, deploy your application, or review past sessions.
                    </Text>
                  </Box>
                  <Box>
                    <Text fw={600} size="sm" mb={4}>Build Feature</Text>
                    <Text size="sm" c="dimmed">
                      Describe a feature in plain language and AI will create a detailed implementation plan across your projects.
                    </Text>
                  </Box>
                  {showDeployCard && (
                    <Box>
                      <Text fw={600} size="sm" mb={4}>Deploy</Text>
                      <Text size="sm" c="dimmed">
                        Set up infrastructure, CI/CD pipelines, and deploy your application to a cloud provider.
                      </Text>
                    </Box>
                  )}
                  <Box>
                    <Text fw={600} size="sm" mb={4}>Sessions</Text>
                    <Text size="sm" c="dimmed">
                      View previous sessions, check their status, and resume any that were interrupted or had errors.
                    </Text>
                  </Box>
                </Stack>
              </HelpOverlay>
            </Group>
          </Stack>

          {/* Navigation Cards */}
          <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="md">
            <GlassCard
              hoverable
              onClick={() => setView('feature')}
              p="lg"
              style={{ minHeight: 160, display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
            >
              <Stack gap={4}>
                <Text fw={600} size="md">Build Feature</Text>
                <Text size="xs" c="dimmed">Plan and implement new features across your projects</Text>
              </Stack>
            </GlassCard>
            {showDeployCard && (
              <GlassCard
                hoverable
                onClick={() => setView('deploy')}
                p="lg"
                style={{ minHeight: 160, display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
              >
                <Stack gap={4}>
                  <Text fw={600} size="md">Deploy</Text>
                  <Text size="xs" c="dimmed">Set up infrastructure and CI/CD for your application</Text>
                </Stack>
              </GlassCard>
            )}
            <GlassCard
              hoverable
              onClick={() => setView('sessions')}
              p="lg"
              style={{ minHeight: 160, display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
            >
              <Stack gap={4}>
                <Text fw={600} size="md">Sessions</Text>
                <Text size="xs" c="dimmed">View and resume previous sessions</Text>
              </Stack>
            </GlassCard>
          </SimpleGrid>
        </Stack>
      </Container>
      </>
    );
  }

  /* ── Feature view ──────────────────────────────────────── */

  if (view === 'feature') {
    return (
      <>
      <BackButton onClick={() => setView('home')} />
      <Container size="md" pt={60} pb="xl">
        <Stack gap="xl">
          {/* Header */}
          <Stack gap={0}>
            <Group justify="space-between" align="center">
              <Group gap="sm" align="center">
                <Title order={3} style={{ letterSpacing: '-.02em' }}>
                  Build Feature
                </Title>
                {workspace.github?.enabled && workspace.github?.repo && githubStatus.authenticated && githubStatus.hasAccess && (
                  <Text size="xs" c="dimmed" ff="monospace">{workspace.github.repo}</Text>
                )}
              </Group>

              {hasDevServerProjects && (
                <Button
                  variant="light"
                  color="sage"
                  size="sm"
                  leftSection={<IconServer size={16} />}
                  onClick={handleStartDevServers}
                  loading={startingDevServers}
                  disabled={hasRunningDevServers || startingDevServers}
                >
                  {hasRunningDevServers ? 'Dev Servers Running' : 'Run Dev Servers'}
                </Button>
              )}
            </Group>
            <Group gap="xs">
              <Text c="dimmed" size="sm">
                Describe your feature and configure project settings
              </Text>
              <Text c="dimmed" size="sm">·</Text>
              <HelpOverlay
                trigger={<HelpTrigger />}
                title="Starting a Session"
                icon={<IconPlayerPlay size={20} style={{ color: 'var(--mantine-color-lavender-5)' }} />}
                maxWidth={580}
              >
                <Stack gap="md">
                  <Box>
                    <Text fw={600} size="sm" mb={4}>What happens when you start?</Text>
                    <Text size="sm" c="dimmed">
                      When you click "Start Planning", AI will analyze your feature request and create a detailed implementation plan. You'll be able to review and approve each step before any code is written.
                    </Text>
                  </Box>

                  <Box>
                    <Text fw={600} size="sm" mb={10}>How to describe your feature:</Text>
                    <Stack gap={8}>
                      {[
                        { step: 1, title: 'Be specific', desc: 'Describe what you want to build in detail' },
                        { step: 2, title: 'Include context', desc: 'Mention any constraints, preferences, or existing patterns to follow' },
                        { step: 3, title: 'Set expectations', desc: 'Note if you want tests, documentation, or specific approaches' },
                      ].map(({ step, title, desc }) => (
                        <Group
                          key={step}
                          gap="xs"
                          wrap="nowrap"
                          align="center"
                          px="sm"
                          py={8}
                          style={{
                            background: 'rgba(250, 247, 245, 0.8)',
                            borderRadius: 10,
                            border: '1px solid rgba(160, 130, 110, 0.08)',
                          }}
                        >
                          <Box
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              background: 'var(--mantine-color-peach-1)',
                              color: 'var(--mantine-color-peach-6)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                          >
                            {step}
                          </Box>
                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text size="xs"><Text span fw={500}>{title}</Text> <Text span c="dimmed">— {desc}</Text></Text>
                          </Box>
                        </Group>
                      ))}
                    </Stack>
                  </Box>

                  <Box>
                    <Text fw={600} size="sm" mb={4}>Projects:</Text>
                    <Text size="sm" c="dimmed">
                      Click any project below the editor to toggle it between planning (editable) and read-only mode.
                    </Text>
                  </Box>
                </Stack>
              </HelpOverlay>
            </Group>
          </Stack>

          {/* GitHub access warning */}
          {workspace.github?.enabled && workspace.github?.repo && !githubStatus.checking && (
            !githubStatus.authenticated ? (
              <Alert
                variant="light"
                color="orange"
                icon={<IconBrandGithub size={18} />}
                title="GitHub Authentication Required"
              >
                <Text size="sm">
                  You are not authenticated with GitHub. Run{' '}
                  <Text span ff="monospace" fw={500}>gh auth login</Text>{' '}
                  in your terminal to authenticate.
                </Text>
              </Alert>
            ) : !githubStatus.hasAccess ? (
              <Alert
                variant="light"
                color="orange"
                icon={<IconBrandGithub size={18} />}
                title="GitHub Access Issue"
              >
                <Text size="sm">
                  {githubStatus.error || `Unable to access repository: ${workspace.github.repo}`}
                </Text>
              </Alert>
            ) : null
          )}

          {/* Feature form */}
          <FormCard
            title="Feature Description"
            footer={
              <Group justify="flex-end">
                <Button variant="subtle" onClick={() => setView('home')}>
                  Cancel
                </Button>
                <Button
                  leftSection={(startingSession || checkingBranches) ? <Loader size={18} /> : <IconRocket size={18} />}
                  onClick={handleStart}
                  disabled={!hasContent || startingSession || checkingBranches}
                  loading={startingSession || checkingBranches}
                >
                  {checkingBranches ? 'Checking...' : startingSession ? 'Starting...' : 'Start Planning'}
                </Button>
              </Group>
            }
          >
            <Stack gap="lg">
              <GlassRichTextEditor
                placeholder="Describe what to build..."
                editor={editor}
              />

              {/* Inline project toggles */}
              {workspace.projects.length > 0 && (
                <Stack gap="xs">
                  <Text size="xs" fw={500} c="dimmed">Projects — click to toggle read-only</Text>
                  <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                    {workspace.projects.map(p => {
                      const config = sessionProjectConfigs.find(c => c.name === p.name);
                      const isReadOnly = config?.readOnly || false;
                      return (
                        <GlassCard
                          key={p.name}
                          p="xs"
                          hoverable
                          style={{
                            cursor: 'pointer',
                            border: isReadOnly
                              ? '1.5px solid var(--mantine-color-sage-4)'
                              : '1.5px solid var(--mantine-color-peach-4)',
                            opacity: isReadOnly ? 0.7 : 1,
                            transition: 'all 0.15s ease',
                          }}
                          onClick={() => {
                            const newConfigs = sessionProjectConfigs.map(c =>
                              c.name === p.name ? { ...c, readOnly: !c.readOnly } : c
                            );
                            setSessionProjectConfigs(newConfigs);
                          }}
                        >
                          <Group gap="xs" wrap="nowrap">
                            <Stack gap={0} style={{ minWidth: 0 }}>
                              <Text size="xs" fw={500} truncate>{p.name}</Text>
                              <Text size="xs" c={isReadOnly ? 'sage.6' : 'peach.6'}>
                                {isReadOnly ? 'Read only' : 'Planning'}
                              </Text>
                            </Stack>
                          </Group>
                        </GlassCard>
                      );
                    })}
                  </SimpleGrid>
                </Stack>
              )}
            </Stack>
          </FormCard>
        </Stack>

        {/* Branch check modal */}
        <BranchCheckModal
          opened={showBranchModal}
          results={branchCheckResult || []}
          checkoutingBranches={checkoutingBranches}
          onCancel={handleBranchCheckCancel}
          onContinue={handleBranchCheckContinue}
          onCheckout={handleBranchCheckCheckout}
        />

        {/* Dev server warning modal */}
        <Modal
          opened={devServerWarningOpened}
          onClose={closeDevServerWarning}
          title={
            <Group gap="xs">
              <ThemeIcon color="honey" variant="light" size="sm">
                <IconAlertTriangle size={14} />
              </ThemeIcon>
              <Text fw={600}>Dev Servers Running</Text>
            </Group>
          }
          centered
          size="sm"
        >
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              You have dev servers running. Please stop them before starting a new session to avoid port conflicts.
            </Text>

            <Stack gap="xs">
              <Button
                color="rose"
                fullWidth
                leftSection={<IconServer size={16} />}
                onClick={handleStopServersAndStart}
              >
                Stop All Dev Servers
              </Button>

              <Button
                variant="subtle"
                color="gray"
                fullWidth
                onClick={closeDevServerWarning}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Modal>
      </Container>
      </>
    );
  }

  /* ── Deploy view ───────────────────────────────────────── */

  if (view === 'deploy') {
    return (
      <>
      <BackButton onClick={() => setView('home')} />
      <Container size="md" pt={60} pb="xl">
        <Stack gap="xl">
          {/* Header */}
          <Stack gap={0}>
            <Title order={3} style={{ letterSpacing: '-.02em' }}>
              Deploy
            </Title>
            <Group gap="xs">
              <Text c="dimmed" size="sm">
                Set up infrastructure and CI/CD for your workspace
              </Text>
              <Text c="dimmed" size="sm">·</Text>
              <HelpOverlay
                trigger={<HelpTrigger />}
                title="Deployment Planning"
                icon={<IconCloudUpload size={20} style={{ color: 'var(--mantine-color-lavender-5)' }} />}
                maxWidth={520}
              >
                <Stack gap="md">
                  <Box>
                    <Text fw={600} size="sm" mb={4}>How deployment works</Text>
                    <Text size="sm" c="dimmed">
                      Select a cloud provider and describe what you need. AI will create a deployment plan including server setup, CI/CD pipelines, and configuration.
                    </Text>
                  </Box>
                  <Box>
                    <Text fw={600} size="sm" mb={4}>What you can deploy</Text>
                    <Text size="sm" c="dimmed">
                      Set up servers, configure Docker, add DNS, set up SSL certificates, create CI/CD pipelines, and more. Describe your requirements and the AI will handle the rest.
                    </Text>
                  </Box>
                  <Box>
                    <Text fw={600} size="sm" mb={4}>Existing deployments</Text>
                    <Text size="sm" c="dimmed">
                      If your workspace already has a deployment, you can modify it — upgrade servers, add services, change configuration, etc.
                    </Text>
                  </Box>
                </Stack>
              </HelpOverlay>
            </Group>
          </Stack>

          {onStartDeployment && (
            <DeploymentTab
              workspace={workspace}
              port={effectivePort}
              startingSession={startingSession}
              onStartDeployment={onStartDeployment}
            />
          )}
        </Stack>
      </Container>
      </>
    );
  }

  /* ── Sessions view ─────────────────────────────────────── */

  return (
    <>
    <BackButton onClick={() => setView('home')} />
    <Container size="md" pt={60} pb="xl">
      <Stack gap="xl">
        {/* Header */}
        <Stack gap={0}>
          <Title order={3} style={{ letterSpacing: '-.02em' }}>
            Sessions
          </Title>
          <Group gap="xs">
            <Text c="dimmed" size="sm">
              View and resume previous sessions
            </Text>
            <Text c="dimmed" size="sm">·</Text>
            <HelpOverlay
              trigger={<HelpTrigger />}
              title="Session History"
              icon={<IconHistory size={20} style={{ color: 'var(--mantine-color-lavender-5)' }} />}
              maxWidth={520}
            >
              <Stack gap="md">
                <Box>
                  <Text fw={600} size="sm" mb={4}>What are sessions?</Text>
                  <Text size="sm" c="dimmed">
                    Each time you start a feature or deployment, a session is created. Sessions track the planning and implementation progress.
                  </Text>
                </Box>
                <Box>
                  <Text fw={600} size="sm" mb={4}>Session statuses</Text>
                  <Text size="sm" c="dimmed">
                    Sessions can be completed (all tasks done), have errors (some tasks failed), or be interrupted (stopped before completion).
                  </Text>
                </Box>
                <Box>
                  <Text fw={600} size="sm" mb={4}>Resuming sessions</Text>
                  <Text size="sm" c="dimmed">
                    Sessions that were interrupted or had errors can be resumed. Click the Resume button to pick up where you left off.
                  </Text>
                </Box>
              </Stack>
            </HelpOverlay>
          </Group>
        </Stack>

        {onSelectHistoricalSession && (
          <SessionHistoryList
            workspaceId={workspace.id}
            onSelectSession={onSelectHistoricalSession}
            onResumeSession={onResumeSession}
            port={effectivePort}
            containerMode
          />
        )}
      </Stack>
    </Container>
    </>
  );
}
