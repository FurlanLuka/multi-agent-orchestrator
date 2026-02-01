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
} from '@mantine/core';
import { IconRocket, IconGitBranch, IconSettings } from '@tabler/icons-react';
import type { WorkspaceConfig, ProjectConfig, SessionProjectConfig } from '@orchy/types';
import { FormCard, GlassTextInput, GlassRichTextEditor, useGlassEditor } from '../../theme';
import { ProjectSelectionPanel } from './ProjectSelectionPanel';
import { BranchCheckModal } from './BranchCheckModal';

interface BranchCheckResult {
  project: string;
  gitEnabled: boolean;
  currentBranch: string | null;
  mainBranch: string;
  isOnMainBranch: boolean;
}

interface PromptScreenProps {
  workspace: WorkspaceConfig;
  projectConfigs: Record<string, ProjectConfig>;
  startingSession: boolean;
  branchCheckResult: BranchCheckResult[] | null;
  checkingBranches: boolean;
  checkoutingBranches: boolean;
  onBack: () => void;
  onStart: (
    feature: string,
    workspaceId: string,
    branchName?: string,
    sessionProjectConfigs?: SessionProjectConfig[]
  ) => void;
  onEditWorkspace: () => void;
  onCheckBranchStatus: (projects: string[]) => void;
  onCheckoutMainBranch: (projects: string[]) => void;
  onClearBranchCheck: () => void;
}

export function PromptScreen({
  workspace,
  projectConfigs,
  startingSession,
  branchCheckResult,
  checkingBranches,
  checkoutingBranches,
  onBack,
  onStart,
  onEditWorkspace,
  onCheckBranchStatus,
  onCheckoutMainBranch,
  onClearBranchCheck,
}: PromptScreenProps) {
  const [branchName, setBranchName] = useState('');
  const [sessionProjectConfigs, setSessionProjectConfigs] = useState<SessionProjectConfig[]>([]);

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

  // Initialize session project configs when workspace changes
  useEffect(() => {
    const configs = workspace.projects.map(name => ({
      name,
      included: true,
      readOnly: false,
    }));
    setSessionProjectConfigs(configs);
  }, [workspace.projects, projectConfigs]);

  const hasGitEnabledProject = workspace.projects.some(
    p => projectConfigs[p]?.gitEnabled
  );

  const hasContent = editor ? editor.getText().trim().length > 0 : false;

  // Get list of included git-enabled projects
  const getIncludedGitProjects = useCallback(() => {
    return sessionProjectConfigs
      .filter(c => c.included && projectConfigs[c.name]?.gitEnabled)
      .map(c => c.name);
  }, [sessionProjectConfigs, projectConfigs]);

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

  const handleBranchCheckCheckout = () => {
    const gitProjects = getIncludedGitProjects();
    onCheckoutMainBranch(gitProjects);
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

  return (
    <Container size="xl" pt={60} pb="xl">
      <Stack gap="xl">
        {/* Page Header */}
        <Stack gap={4}>
          <Group gap="xs" align="center">
            <Title order={2} style={{ letterSpacing: '-.02em' }}>
              {workspace.name}
            </Title>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={onEditWorkspace}>
              <IconSettings size={16} />
            </ActionIcon>
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
              projects={workspace.projects}
              projectConfigs={projectConfigs}
              sessionProjectConfigs={sessionProjectConfigs}
              onConfigChange={setSessionProjectConfigs}
            />
          </Grid.Col>
        </Grid>
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
