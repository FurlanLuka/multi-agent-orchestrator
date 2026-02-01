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
  Grid,
  Badge,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconRocket,
  IconGitBranch,
  IconPlus,
  IconEdit,
  IconTrash,
  IconCheck,
} from '@tabler/icons-react';
import type {
  WorkspaceConfig,
  ProjectConfig,
  SessionProjectConfig,
  WorkspaceProjectConfig,
  ProjectTemplateConfig,
  ProjectTemplate,
} from '@orchy/types';
import {
  FormCard,
  GlassTextInput,
  GlassRichTextEditor,
  GlassTextarea,
  useGlassEditor,
  GlassCard,
} from '../../theme';
import { ProjectSelectionPanel } from './ProjectSelectionPanel';
import { BranchCheckModal } from './BranchCheckModal';
import { SessionHistoryList } from './SessionHistoryList';
import { AddProjectModal } from '../AddProjectModal';
import type { AddProjectOptions, CreateProjectOptions } from '../AddProjectModal';
import { EditProjectModal } from '../EditProjectModal';
import type { PermissionsConfig } from '../CollapsiblePermissions';

interface BranchCheckResult {
  project: string;
  gitEnabled: boolean;
  currentBranch: string | null;
  mainBranch: string;
  isOnMainBranch: boolean;
  hasUncommittedChanges: boolean;
  uncommittedDetails?: { staged: number; unstaged: number; untracked: number };
}

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
  gitAvailable: boolean;
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
  // Workspace project CRUD
  onAddProjectToWorkspace: (workspaceId: string, project: WorkspaceProjectConfig) => void;
  onUpdateWorkspaceProject: (workspaceId: string, projectName: string, updates: Partial<ProjectConfig>) => void;
  onRemoveProjectFromWorkspace: (workspaceId: string, projectName: string) => void;
  onUpdateWorkspace: (id: string, updates: { name?: string; context?: string }) => void;
  onCreateProjectFromTemplate: (options: { name: string; targetPath: string; template: ProjectTemplate; permissions?: { dangerouslyAllowAll?: boolean; allow: string[] } }) => void;
  createProjectError?: string | null;
  onClearCreateProjectError?: () => void;
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
  gitAvailable,
  port,
  forceEditMode = false,
  onBack,
  onStart,
  onCheckBranchStatus,
  onCheckoutMainBranch,
  onClearBranchCheck,
  onSelectHistoricalSession,
  onAddProjectToWorkspace,
  onUpdateWorkspaceProject,
  onRemoveProjectFromWorkspace,
  onUpdateWorkspace,
  onCreateProjectFromTemplate,
  createProjectError,
  onClearCreateProjectError,
}: PromptScreenProps) {
  const [branchName, setBranchName] = useState('');
  const [sessionProjectConfigs, setSessionProjectConfigs] = useState<SessionProjectConfig[]>([]);
  // Check if workspace has projects (used to prevent exiting edit mode when empty)
  const hasProjects = workspace.projects.length > 0;

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

  // Modal states
  const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);

  // Store pending start params while showing branch check modal
  const [pendingStartParams, setPendingStartParams] = useState<{
    feature: string;
    workspaceId: string;
    branchName?: string;
    includedConfigs: SessionProjectConfig[];
  } | null>(null);

  const editor = useGlassEditor({
    placeholder: 'Describe what to build...',
  });

  const effectivePort = port ?? (window as unknown as { __ORCHESTRATOR_PORT__?: number }).__ORCHESTRATOR_PORT__ ?? 3456;

  // Fetch permissions config
  useEffect(() => {
    if (effectivePort === null) return;

    fetch(`http://localhost:${effectivePort}/api/permissions`)
      .then(res => res.json())
      .then(data => setPermissionsConfig(data))
      .catch(err => console.error('Failed to fetch permissions config:', err));
  }, [effectivePort]);

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

  // Sync context when workspace changes
  useEffect(() => {
    setContextValue(workspace.context || '');
  }, [workspace.context]);

  const hasGitEnabledProject = workspace.projects.some(
    p => p.gitEnabled
  );

  const hasContent = editor ? editor.getText().trim().length > 0 : false;

  // Get list of included git-enabled projects
  const getIncludedGitProjects = useCallback(() => {
    return sessionProjectConfigs
      .filter(c => c.included && workspaceProjectConfigs[c.name]?.gitEnabled)
      .map(c => c.name);
  }, [sessionProjectConfigs, workspaceProjectConfigs]);

  const handleStart = () => {
    const text = editor?.getText().trim();
    if (text) {
      // Filter to only included projects
      const includedConfigs = sessionProjectConfigs.filter(c => c.included);
      const gitProjects = getIncludedGitProjects();

      // If there are git-enabled projects, check their branch status first
      if (gitProjects.length > 0) {
        setPendingStartParams({
          feature: text,
          workspaceId: workspace.id,
          branchName: hasGitEnabledProject ? branchName.trim() || undefined : undefined,
          includedConfigs,
        });
        onCheckBranchStatus(gitProjects);
      } else {
        // No git projects, start immediately
        onStart(
          text,
          workspace.id,
          undefined,
          includedConfigs
        );
      }
    }
  };

  // Handle branch check result
  useEffect(() => {
    if (branchCheckResult && pendingStartParams) {
      // Check if any projects are NOT on their main branch
      const hasProjectsOffMain = branchCheckResult.some(
        r => r.gitEnabled && !r.isOnMainBranch && r.currentBranch
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
    const gitProjects = getIncludedGitProjects();
    onCheckoutMainBranch(gitProjects, stashFirst);
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
    branchCheckResult.some(r => r.gitEnabled && !r.isOnMainBranch && r.currentBranch);

  // Edit mode handlers
  const handleToggleEditMode = () => {
    if (isEditMode) {
      // Can't exit edit mode if workspace has no projects
      if (!hasProjects) {
        return;
      }
      // Exiting edit mode - save context if changed
      if (contextValue !== workspace.context) {
        onUpdateWorkspace(workspace.id, { context: contextValue });
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
      gitEnabled: options.gitEnabled,
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

  // Edit mode view
  if (isEditMode) {
    return (
      <Container size="xl" pt={60} pb="xl">
        <Stack gap="xl">
          {/* Header */}
          <Stack gap={4}>
            <Group justify="space-between" align="center">
              <Title order={2} style={{ letterSpacing: '-.02em' }}>
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
                          {project.gitEnabled && (
                            <Badge size="xs" variant="light" color="lavender">Git</Badge>
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
        </Stack>

        {/* Add Project Modal */}
        <AddProjectModal
          opened={addModalOpened}
          onClose={closeAddModal}
          templates={templates}
          projects={workspaceProjectConfigs}
          creatingProject={creatingProject}
          addingProject={addingProject}
          gitAvailable={gitAvailable}
          port={effectivePort}
          permissionsConfig={permissionsConfig}
          createProjectError={createProjectError}
          onClearCreateProjectError={onClearCreateProjectError}
          onCreateProject={handleCreateProject}
          onAddProject={handleAddProject}
        />

        {/* Edit Project Modal */}
        <EditProjectModal
          opened={editModalOpened}
          onClose={handleCloseEditModal}
          projectName={editingProject}
          projectConfig={editingProject ? workspaceProjectConfigs[editingProject] : null}
          projects={workspaceProjectConfigs}
          gitAvailable={gitAvailable}
          permissionsConfig={permissionsConfig}
          onSave={handleSaveProject}
        />
      </Container>
    );
  }

  // Normal prompt view
  return (
    <Container size="xl" pt={60} pb="xl">
      <Stack gap="xl">
        {/* Page Header */}
        <Stack gap={4}>
          <Group gap="xs" align="center">
            <Title order={2} style={{ letterSpacing: '-.02em' }}>
              {workspace.name}
            </Title>
            <Tooltip label="Edit workspace">
              <ActionIcon variant="subtle" color="gray" size="sm" onClick={handleToggleEditMode}>
                <IconEdit size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Text c="dimmed" size="sm">
            Describe your feature and configure project settings
          </Text>
        </Stack>

        {/* Two-column layout */}
        <Grid gutter="lg" align="stretch">
          {/* Left card: Feature description */}
          <Grid.Col span={{ base: 12, md: 7 }}>
            <FormCard
              showHeader
              footer={
                <Group justify="flex-end">
                  <Button variant="subtle" onClick={onBack}>
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
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <Stack gap="lg" style={{ flex: 1 }}>
                <GlassRichTextEditor
                  label="Feature Description"
                  placeholder="Describe what to build..."
                  editor={editor}
                />

                {hasGitEnabledProject && (
                  <GlassTextInput
                    label="Branch Name"
                    placeholder="e.g., feature/my-feature (auto-generated if empty)"
                    description="Feature branch will be created for git-enabled projects"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    leftSection={<IconGitBranch size={16} />}
                  />
                )}
              </Stack>
            </FormCard>
          </Grid.Col>

          {/* Right card: Project selection */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <ProjectSelectionPanel
              projects={workspace.projects.map(p => p.name)}
              projectConfigs={workspaceProjectConfigs}
              sessionProjectConfigs={sessionProjectConfigs}
              onConfigChange={setSessionProjectConfigs}
            />
          </Grid.Col>
        </Grid>

        {/* Session history */}
        {onSelectHistoricalSession && (
          <SessionHistoryList
            workspaceId={workspace.id}
            onSelectSession={onSelectHistoricalSession}
          />
        )}
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
    </Container>
  );
}
