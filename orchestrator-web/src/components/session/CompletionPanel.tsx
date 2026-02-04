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
  IconGitBranch,
  IconUpload,
  IconGitMerge,
  IconExternalLink,
  IconGitPullRequest,
  IconSparkles,
  IconX,
  IconAlertTriangle,
  IconRefresh,
  IconTrash,
  IconHome,
} from '@tabler/icons-react';
import { useOrchestrator } from '../../context/OrchestratorContext';
import { GlassCard, GlassSelect } from '../../theme';
import type { ProjectConfig } from '@orchy/types';

interface CompletionPanelProps {
  onBackToHome?: () => void;
  failed?: boolean;
}

export function CompletionPanel({ onBackToHome, failed = false }: CompletionPanelProps) {
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
    creatingPR,
    prResults,
    createPR,
    gitHubInfo,
    availableBranches,
    loadingBranches,
    getBranches,
  } = useOrchestrator();

  // Derive project configs and workspace settings
  const { projectConfigs, isManagedGit } = useMemo(() => {
    const configs: Record<string, ProjectConfig> = {};
    let managedGit = false;

    if (session?.workspaceId && workspaces[session.workspaceId]) {
      const workspace = workspaces[session.workspaceId];
      for (const proj of workspace.projects) {
        const { name, ...config } = proj;
        configs[name] = config;
      }
      managedGit = workspace.managedGit !== false;
    }
    return { projectConfigs: configs, isManagedGit: managedGit };
  }, [session?.workspaceId, workspaces]);

  // Check if all changes have been approved/merged
  const allChangesApproved = useMemo(() => {
    if (!approveChangesResults) return false;
    return Object.values(approveChangesResults).every(r => r.success);
  }, [approveChangesResults]);

  // Check if any merge failed
  const hasMergeFailure = useMemo(() => {
    if (!approveChangesResults) return false;
    return Object.values(approveChangesResults).some(r => !r.success);
  }, [approveChangesResults]);

  // Selected base branch for PR creation per project
  const [prBaseBranch, setPrBaseBranch] = useState<Record<string, string>>({});

  const handleEndSession = () => {
    stopSession();
    startNewSession();
    if (onBackToHome) {
      onBackToHome();
    }
  };

  // ============================================
  // FAILED STATE - Session failed (task/e2e failed)
  // ============================================
  if (failed) {
    return (
      <Stack gap="md" mb="md">
        <GlassCard p="lg">
          <Stack gap="md" align="center" py="sm">
            <ThemeIcon size={48} radius="xl" color="red" variant="light">
              <IconAlertTriangle size={28} />
            </ThemeIcon>
            <Box ta="center">
              <Text fw={600} size="lg" mb={4}>Something went wrong</Text>
              <Text size="sm" c="dimmed" maw={320}>
                The session couldn't be completed. Your work has been saved
                in a separate branch so nothing is lost.
              </Text>
            </Box>
            <Group gap="sm" mt="sm">
              <Button
                size="md"
                variant="light"
                color="gray"
                leftSection={<IconHome size={18} />}
                onClick={handleEndSession}
              >
                Back to Home
              </Button>
            </Group>
            <Text size="xs" c="dimmed" ta="center" maw={300}>
              You can review the changes manually or start a new session.
            </Text>
          </Stack>
        </GlassCard>
      </Stack>
    );
  }

  // ============================================
  // SUCCESS STATE - Session completed successfully
  // ============================================
  return (
    <Stack gap="md" mb="md">
      {/* Managed Git: User-friendly Save/Discard Card */}
      {session?.gitBranches && Object.keys(session.gitBranches).length > 0 && isManagedGit && (
        <GlassCard p="lg">
          <Stack gap="md">
            {/* Success state - changes merged */}
            {allChangesApproved && (
              <Stack gap="sm" align="center" py="md">
                <ThemeIcon size={48} radius="xl" color="sage" variant="light">
                  <IconCheck size={28} />
                </ThemeIcon>
                <Text fw={600} size="lg" ta="center">All Done!</Text>
                <Text size="sm" c="dimmed" ta="center">
                  Your changes have been saved to the project.
                </Text>
              </Stack>
            )}

            {/* Loading state */}
            {approvingChanges && (
              <Stack gap="sm" align="center" py="md">
                <Loader size="md" />
                <Text fw={500} size="md">Saving your changes...</Text>
                <Text size="xs" c="dimmed">This will only take a moment</Text>
              </Stack>
            )}

            {/* Error state - merge failed */}
            {hasMergeFailure && !approvingChanges && (
              <Stack gap="md" align="center" py="sm">
                <ThemeIcon size={48} radius="xl" color="orange" variant="light">
                  <IconAlertTriangle size={28} />
                </ThemeIcon>
                <Box ta="center">
                  <Text fw={600} size="md" mb={4}>Couldn't save changes</Text>
                  <Text size="sm" c="dimmed">
                    Don't worry - your work is safe in a separate branch.
                  </Text>
                </Box>
                <Box
                  p="xs"
                  style={{
                    background: 'rgba(0, 0, 0, 0.03)',
                    borderRadius: 6,
                    maxWidth: '100%',
                  }}
                >
                  {Object.entries(approveChangesResults || {})
                    .filter(([, r]) => !r.success)
                    .map(([project, result]) => (
                      <Text key={project} size="xs" c="dimmed" style={{ wordBreak: 'break-word' }}>
                        {result.message}
                      </Text>
                    ))}
                </Box>
                <Group gap="sm">
                  <Button
                    variant="filled"
                    color="sage"
                    leftSection={<IconRefresh size={16} />}
                    onClick={() => session?.id && approveChanges(session.id)}
                  >
                    Try Again
                  </Button>
                  <Button
                    variant="light"
                    color="gray"
                    leftSection={<IconX size={16} />}
                    onClick={handleEndSession}
                  >
                    Close Session
                  </Button>
                </Group>
              </Stack>
            )}

            {/* Initial state - Save/Discard */}
            {!approveChangesResults && !approvingChanges && (
              <Stack gap="md" align="center" py="sm">
                <ThemeIcon size={48} radius="xl" color="peach" variant="light">
                  <IconSparkles size={28} />
                </ThemeIcon>
                <Box ta="center">
                  <Text fw={600} size="lg" mb={4}>Ready to save!</Text>
                  <Text size="sm" c="dimmed">
                    Your feature is complete. Save your changes to keep them.
                  </Text>
                </Box>
                <Group gap="sm">
                  <Button
                    size="md"
                    color="sage"
                    leftSection={<IconCheck size={18} />}
                    onClick={() => session?.id && approveChanges(session.id)}
                  >
                    Save Changes
                  </Button>
                  <Button
                    size="md"
                    variant="light"
                    color="gray"
                    leftSection={<IconTrash size={18} />}
                    onClick={handleEndSession}
                  >
                    Discard
                  </Button>
                </Group>
                <Text size="xs" c="dimmed" ta="center" maw={300}>
                  Saving will add your changes to the main codebase. Discarding will remove them.
                </Text>
              </Stack>
            )}
          </Stack>
        </GlassCard>
      )}

      {/* Non-managed Git: Manual git operations (for advanced users) */}
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

              const branchOptions = branches.length > 0
                ? branches.map(b => ({ value: b, label: b }))
                : [{ value: mainBranch, label: mainBranch }];

              return (
                <Stack key={projectName} gap="xs">
                  <Group gap="xs" wrap="wrap">
                    <Badge variant="light" color="lavender" leftSection={<IconGitBranch size={12} />}>
                      {projectName}: {branchName}
                    </Badge>

                    {mergeResult?.success ? (
                      <Badge color="sage" variant="filled" leftSection={<IconGitMerge size={12} />}>
                        Merged to {mainBranch}
                      </Badge>
                    ) : pushResult?.success ? (
                      <>
                        <Badge color="sage" variant="light" leftSection={<IconCheck size={12} />}>
                          Pushed
                        </Badge>
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
    </Stack>
  );
}
