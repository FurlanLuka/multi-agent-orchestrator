import { useState, useMemo } from 'react';
import {
  Stack,
  Group,
  ThemeIcon,
  Text,
  Button,
  Badge,
  Box,
  Loader,
} from '@mantine/core';
import {
  IconCheck,
  IconRefresh,
  IconGitBranch,
  IconUpload,
  IconGitMerge,
  IconExternalLink,
  IconPlayerStop,
  IconGitPullRequest,
  IconCircleCheck,
  IconInfoCircle,
} from '@tabler/icons-react';
import { useOrchestrator } from '../../context/OrchestratorContext';
import { GlassCard, GlassSelect } from '../../theme';
import type { ProjectConfig } from '@orchy/types';

interface CompletionPanelProps {
  onBackToHome?: () => void;
}

export function CompletionPanel({ onBackToHome }: CompletionPanelProps = {}) {
  const {
    session,
    workspaces,
    dependencyCheck,
    startNewSession,
    stopSession,
    pushingBranch,
    pushResults,
    pushBranch,
    mergingBranch,
    mergeResults,
    mergeBranch,
    approveChanges,
    approvingChanges,
    approveChangesResults,
    mergeSessionStatus,
    creatingPR,
    prResults,
    createPR,
    gitHubInfo,
    availableBranches,
    loadingBranches,
    getBranches,
  } = useOrchestrator();

  // Derive project configs and workspace settings
  const { projectConfigs, isManagedGit, isAutoMerge, isOrchyManaged } = useMemo(() => {
    const configs: Record<string, ProjectConfig> = {};
    let managedGit = false;
    let autoMerge = false;
    let orchyManaged = false;

    if (session?.workspaceId && workspaces[session.workspaceId]) {
      const workspace = workspaces[session.workspaceId];
      for (const proj of workspace.projects) {
        const { name, ...config } = proj;
        configs[name] = config;
      }
      // Check if managed git is enabled (default: true for new workspaces)
      managedGit = workspace.managedGit !== false;
      autoMerge = workspace.autoMerge !== false;
      orchyManaged = workspace.orchyManaged === true;
    }
    return { projectConfigs: configs, isManagedGit: managedGit, isAutoMerge: autoMerge, isOrchyManaged: orchyManaged };
  }, [session?.workspaceId, workspaces]);

  // Check if all changes have been approved/merged
  const allChangesApproved = useMemo(() => {
    if (!approveChangesResults) return false;
    return Object.values(approveChangesResults).every(r => r.success);
  }, [approveChangesResults]);

  // Selected base branch for PR creation per project
  const [prBaseBranch, setPrBaseBranch] = useState<Record<string, string>>({});

  return (
    <Stack gap="md" mb="md">
      {/* Card 1: Feature Complete + Start New Session */}
      <GlassCard
        p="md"
        style={{
          borderColor: 'rgba(74, 145, 73, 0.3)',
          backgroundColor: 'rgba(74, 145, 73, 0.08)',
        }}
      >
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <ThemeIcon size="lg" radius="md" color="sage" variant="light">
              <IconCheck size={20} />
            </ThemeIcon>
            <div>
              <Text fw={600} size="md" style={{ color: 'var(--text-heading)' }}>Feature Complete!</Text>
              <Text size="sm" c="dimmed">All projects have completed their tasks successfully.</Text>
            </div>
          </Group>
          <Group gap="sm">
            {onBackToHome && (
              <Button
                variant="light"
                color="gray"
                leftSection={<IconRefresh size={16} />}
                onClick={() => {
                  startNewSession();  // Clear session before navigating
                  onBackToHome();
                }}
              >
                Back to Home
              </Button>
            )}
            <Button
              variant="filled"
              color="peach"
              leftSection={<IconRefresh size={16} />}
              onClick={startNewSession}
            >
              Start New Session
            </Button>
          </Group>
        </Group>
      </GlassCard>

      {/* Card 2: Approve Changes (Managed Git) */}
      {session?.gitBranches && Object.keys(session.gitBranches).length > 0 && isManagedGit && (
        <GlassCard p="md">
          <Stack gap="md">
            {/* Header */}
            <Group gap="xs">
              <ThemeIcon size="sm" radius="md" color="sage" variant="light">
                <IconCircleCheck size={14} />
              </ThemeIcon>
              <Text size="sm" fw={600} style={{ color: 'var(--text-heading)' }}>Approve Changes</Text>
            </Group>

            {/* Auto-merged status */}
            {isAutoMerge && allChangesApproved && (
              <Group gap="sm" align="center">
                <ThemeIcon size="lg" radius="md" color="sage" variant="light">
                  <IconCheck size={18} />
                </ThemeIcon>
                <Box>
                  <Text fw={500} size="sm">Changes approved and merged</Text>
                  <Text size="xs" c="dimmed">All feature branches have been merged to main.</Text>
                </Box>
              </Group>
            )}

            {/* Manual approval UI (when autoMerge is disabled or merge not yet done) */}
            {(!isAutoMerge || !allChangesApproved) && !approvingChanges && (
              <>
                {/* Help text */}
                <Box
                  p="sm"
                  style={{
                    background: 'rgba(250, 247, 245, 0.8)',
                    borderRadius: 8,
                    border: '1px solid rgba(160, 130, 110, 0.08)',
                  }}
                >
                  <Group gap="xs" mb={6}>
                    <IconInfoCircle size={14} style={{ color: 'var(--mantine-color-peach-6)' }} />
                    <Text size="xs" fw={500}>What happens when you approve?</Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {isOrchyManaged
                      ? 'Your feature branch will be pushed to remote and merged into main. All project changes are committed to a single repository.'
                      : 'Your feature branches will be pushed to remote and merged into the main branch across all projects.'}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    <strong>Not ready yet?</strong> You can close this and approve later from the session history.
                  </Text>
                </Box>

                {/* Branch list */}
                <Stack gap="xs">
                  {Object.entries(session.gitBranches).map(([projectName, branchName]) => {
                    // Handle _workspace key for Orchy Managed workspaces
                    const isWorkspaceBranch = projectName === '_workspace';
                    const displayName = isWorkspaceBranch ? 'Workspace' : projectName;
                    const mainBranch = isWorkspaceBranch ? 'main' : (projectConfigs[projectName]?.mainBranch || 'main');
                    const result = approveChangesResults?.[projectName];

                    return (
                      <Group key={projectName} gap="xs" wrap="wrap">
                        <Badge variant="light" color="lavender" leftSection={<IconGitBranch size={12} />}>
                          {isWorkspaceBranch ? branchName : `${displayName}: ${branchName}`}
                        </Badge>
                        <Text size="xs" c="dimmed">→ {mainBranch}</Text>
                        {isWorkspaceBranch && (
                          <Badge size="xs" variant="light" color="peach">
                            All projects
                          </Badge>
                        )}
                        {result?.success && (
                          <Badge color="sage" variant="filled" size="xs" leftSection={<IconCheck size={10} />}>
                            Merged
                          </Badge>
                        )}
                        {result && !result.success && (
                          <Badge color="rose" variant="light" size="xs">
                            Failed
                          </Badge>
                        )}
                      </Group>
                    );
                  })}
                </Stack>

                {/* Approve button */}
                {!allChangesApproved && (
                  <Button
                    color="sage"
                    leftSection={<IconCircleCheck size={16} />}
                    onClick={() => session?.id && approveChanges(session.id)}
                  >
                    Approve Changes
                  </Button>
                )}

                {/* Error display */}
                {approveChangesResults && !allChangesApproved && (
                  <Text size="xs" c="rose">
                    Some merge operations failed. Check the status above for details.
                  </Text>
                )}
              </>
            )}

            {/* Loading state */}
            {approvingChanges && (
              <Stack gap="sm" align="center" py="md">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  {isOrchyManaged ? 'Pushing and merging workspace branch...' : 'Pushing and merging branches...'}
                </Text>
                <Stack gap="xs" w="100%">
                  {Object.entries(session.gitBranches).map(([projectName]) => {
                    const status = mergeSessionStatus[projectName];
                    const isWorkspaceBranch = projectName === '_workspace';
                    const displayName = isWorkspaceBranch ? 'Workspace' : projectName;
                    return (
                      <Group key={projectName} gap="xs" wrap="wrap">
                        <Badge variant="light" color="lavender" leftSection={<IconGitBranch size={12} />}>
                          {displayName}
                        </Badge>
                        {isWorkspaceBranch && (
                          <Badge size="xs" variant="light" color="peach">All projects</Badge>
                        )}
                        {status === 'pushing' && <Badge color="peach" variant="light" size="xs">Pushing...</Badge>}
                        {status === 'merging' && <Badge color="honey" variant="light" size="xs">Merging...</Badge>}
                        {status === 'completed' && <Badge color="sage" variant="filled" size="xs" leftSection={<IconCheck size={10} />}>Done</Badge>}
                        {status === 'failed' && <Badge color="rose" variant="light" size="xs">Failed</Badge>}
                      </Group>
                    );
                  })}
                </Stack>
              </Stack>
            )}
          </Stack>
        </GlassCard>
      )}

      {/* Card 2b: Git Operations (non-managed git) */}
      {session?.gitBranches && Object.keys(session.gitBranches).length > 0 && !isManagedGit && (
        <GlassCard p="md">
          <Stack gap="md">
            <Group gap="xs">
              <ThemeIcon size="sm" radius="md" color="lavender" variant="light">
                <IconGitBranch size={14} />
              </ThemeIcon>
              <Text size="sm" fw={600} style={{ color: 'var(--text-heading)' }}>Git Operations</Text>
            </Group>

            {Object.entries(session.gitBranches).map(([projectName, branchName]) => {
              const isPushing = pushingBranch[projectName];
              const pushResult = pushResults[projectName];
              const isMerging = mergingBranch[projectName];
              const mergeResult = mergeResults[projectName];
              const mainBranch = projectConfigs[projectName]?.mainBranch || 'main';
              const ghInfo = gitHubInfo[projectName];
              const isGitHubProject = ghInfo?.isGitHub && dependencyCheck?.gh?.available;
              const isCreating = creatingPR[projectName];
              const prResult = prResults[projectName];
              const branches = availableBranches[projectName] || [];
              const isLoadingBranches = loadingBranches[projectName];
              const selectedBaseBranch = prBaseBranch[projectName] || mainBranch;

              // Build branch options for PR
              const branchOptions = branches.length > 0
                ? branches.map(b => ({ value: b, label: b }))
                : [{ value: mainBranch, label: mainBranch }];

              return (
                <Stack key={projectName} gap="xs">
                  <Group gap="xs" wrap="wrap">
                    <Badge variant="light" color="lavender" leftSection={<IconGitBranch size={12} />}>
                      {projectName}: {branchName}
                    </Badge>

                    {/* If merge succeeded, show merged badge */}
                    {mergeResult?.success ? (
                      <Badge color="sage" variant="filled" leftSection={<IconGitMerge size={12} />}>
                        Merged to {mainBranch}
                      </Badge>
                    ) : pushResult?.success ? (
                      // Push succeeded - show status and merge/PR options
                      <>
                        <Badge color="sage" variant="light" leftSection={<IconCheck size={12} />}>
                          Pushed
                        </Badge>
                        {/* Only show merge button for non-GitHub projects */}
                        {!isGitHubProject && (
                          <>
                            <Button
                              variant="light"
                              color="sage"
                              size="xs"
                              leftSection={isMerging ? undefined : <IconGitMerge size={14} />}
                              loading={isMerging}
                              onClick={() => mergeBranch(projectName, branchName)}
                              disabled={isMerging}
                            >
                              Merge to {mainBranch}
                            </Button>
                            {mergeResult && !mergeResult.success && (
                              <Text size="xs" c="red">{mergeResult.message}</Text>
                            )}
                          </>
                        )}
                        {/* GitHub PR creation */}
                        {isGitHubProject && !prResult?.success && (
                          <>
                            <GlassSelect
                              size="xs"
                              w={140}
                              value={selectedBaseBranch}
                              onChange={(val) => setPrBaseBranch(prev => ({ ...prev, [projectName]: val || mainBranch }))}
                              data={branchOptions}
                              placeholder="Target branch"
                              searchable
                              nothingFoundMessage="No branches found"
                              onDropdownOpen={() => {
                                if (branches.length === 0 && !isLoadingBranches) {
                                  getBranches(projectName);
                                }
                              }}
                              rightSection={isLoadingBranches ? <Badge size="xs" variant="dot" color="peach">...</Badge> : undefined}
                            />
                            <Button
                              variant="filled"
                              color="sage"
                              size="xs"
                              leftSection={isCreating ? undefined : <IconGitPullRequest size={14} />}
                              loading={isCreating}
                              onClick={() => createPR(projectName, branchName, selectedBaseBranch)}
                              disabled={isCreating}
                            >
                              Open PR
                            </Button>
                          </>
                        )}
                        {prResult?.success && prResult.prUrl && (
                          <>
                            <Badge color="sage" variant="light" leftSection={<IconGitPullRequest size={12} />}>
                              PR Created
                            </Badge>
                            <Button
                              component="a"
                              href={prResult.prUrl}
                              target="_blank"
                              variant="subtle"
                              color="peach"
                              size="xs"
                              leftSection={<IconExternalLink size={14} />}
                            >
                              View PR
                            </Button>
                          </>
                        )}
                      </>
                    ) : (
                      // Show push button
                      <>
                        <Button
                          variant="filled"
                          color="lavender"
                          size="xs"
                          leftSection={isPushing ? undefined : <IconUpload size={14} />}
                          loading={isPushing}
                          onClick={() => pushBranch(projectName, branchName)}
                          disabled={isPushing}
                        >
                          Push to Remote
                        </Button>
                        {pushResult && !pushResult.success && (
                          <Text size="xs" c="red">{pushResult.message}</Text>
                        )}
                      </>
                    )}
                  </Group>
                  {prResult && !prResult.success && (
                    <Text size="xs" c="red" ml="xs">{prResult.message}</Text>
                  )}
                </Stack>
              );
            })}
          </Stack>
        </GlassCard>
      )}

      {/* Card 3: Dev Servers */}
      {session?.projects.some(p => projectConfigs[p]?.devServer?.url) && (
        <GlassCard p="md">
          <Stack gap="md">
            <Group gap="xs">
              <ThemeIcon size="sm" radius="md" color="peach" variant="light">
                <IconExternalLink size={14} />
              </ThemeIcon>
              <Text size="sm" fw={600} style={{ color: 'var(--text-heading)' }}>Dev Servers</Text>
            </Group>

            <Group gap="sm" align="center" wrap="wrap">
              {session?.projects.map(projectName => {
                const config = projectConfigs[projectName];
                if (!config?.devServer?.url) return null;
                return (
                  <Button
                    key={projectName}
                    component="a"
                    href={config.devServer.url}
                    target="_blank"
                    variant="light"
                    color="peach"
                    size="xs"
                    leftSection={<IconExternalLink size={14} />}
                  >
                    {projectName}
                  </Button>
                );
              })}
              <Button
                variant="light"
                color="rose"
                size="xs"
                leftSection={<IconPlayerStop size={14} />}
                onClick={stopSession}
              >
                Stop Dev Servers
              </Button>
            </Group>
          </Stack>
        </GlassCard>
      )}
    </Stack>
  );
}
