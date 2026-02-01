import { useState, useMemo } from 'react';
import {
  Stack,
  Group,
  ThemeIcon,
  Text,
  Button,
  Badge,
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
    creatingPR,
    prResults,
    createPR,
    gitHubInfo,
    availableBranches,
    loadingBranches,
    getBranches,
  } = useOrchestrator();

  // Derive project configs from workspace
  const projectConfigs = useMemo(() => {
    const configs: Record<string, ProjectConfig> = {};
    if (session?.workspaceId && workspaces[session.workspaceId]) {
      const workspace = workspaces[session.workspaceId];
      for (const proj of workspace.projects) {
        const { name, ...config } = proj;
        configs[name] = config;
      }
    }
    return configs;
  }, [session?.workspaceId, workspaces]);

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

      {/* Card 2: Git Operations */}
      {session?.gitBranches && Object.keys(session.gitBranches).length > 0 && (
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
