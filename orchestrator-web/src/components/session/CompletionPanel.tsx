import { useState } from 'react';
import {
  Stack,
  Paper,
  Group,
  ThemeIcon,
  Text,
  Button,
  Badge,
  Select,
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

export function CompletionPanel() {
  const {
    session,
    projects,
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

  // Selected base branch for PR creation per project
  const [prBaseBranch, setPrBaseBranch] = useState<Record<string, string>>({});

  return (
    <Stack gap="md" mb="md">
      {/* Card 1: Feature Complete + Start New Session */}
      <Paper shadow="sm" radius="md" p="md" withBorder style={{ borderColor: 'var(--mantine-color-green-3)', backgroundColor: 'var(--mantine-color-green-0)' }}>
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <ThemeIcon size="lg" radius="md" color="green" variant="light">
              <IconCheck size={20} />
            </ThemeIcon>
            <div>
              <Text fw={600} size="md">Feature Complete!</Text>
              <Text size="sm" c="dimmed">All projects have completed their tasks successfully.</Text>
            </div>
          </Group>
          <Button
            variant="filled"
            color="blue"
            leftSection={<IconRefresh size={16} />}
            onClick={startNewSession}
          >
            Start New Session
          </Button>
        </Group>
      </Paper>

      {/* Card 2: Git Operations */}
      {session?.gitBranches && Object.keys(session.gitBranches).length > 0 && (
        <Paper shadow="sm" radius="md" p="md" withBorder>
          <Stack gap="md">
            <Group gap="xs">
              <ThemeIcon size="sm" radius="md" color="violet" variant="light">
                <IconGitBranch size={14} />
              </ThemeIcon>
              <Text size="sm" fw={600}>Git Operations</Text>
            </Group>

            {Object.entries(session.gitBranches).map(([projectName, branchName]) => {
              const isPushing = pushingBranch[projectName];
              const pushResult = pushResults[projectName];
              const isMerging = mergingBranch[projectName];
              const mergeResult = mergeResults[projectName];
              const mainBranch = projects[projectName]?.mainBranch || 'main';
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
                    <Badge variant="light" color="violet" leftSection={<IconGitBranch size={12} />}>
                      {projectName}: {branchName}
                    </Badge>

                    {/* If merge succeeded, show merged badge */}
                    {mergeResult?.success ? (
                      <Badge color="green" variant="filled" leftSection={<IconGitMerge size={12} />}>
                        Merged to {mainBranch}
                      </Badge>
                    ) : pushResult?.success ? (
                      // Push succeeded - show status and merge/PR options
                      <>
                        <Badge color="green" variant="light" leftSection={<IconCheck size={12} />}>
                          Pushed
                        </Badge>
                        {/* Only show merge button for non-GitHub projects */}
                        {!isGitHubProject && (
                          <>
                            <Button
                              variant="light"
                              color="teal"
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
                            <Select
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
                              rightSection={isLoadingBranches ? <Badge size="xs" variant="dot" color="blue">...</Badge> : undefined}
                            />
                            <Button
                              variant="filled"
                              color="green"
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
                            <Badge color="green" variant="light" leftSection={<IconGitPullRequest size={12} />}>
                              PR Created
                            </Badge>
                            <Button
                              component="a"
                              href={prResult.prUrl}
                              target="_blank"
                              variant="subtle"
                              color="blue"
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
                          color="violet"
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
        </Paper>
      )}

      {/* Card 3: Dev Servers */}
      {session?.projects.some(p => projects[p]?.devServer?.url) && (
        <Paper shadow="sm" radius="md" p="md" withBorder>
          <Stack gap="md">
            <Group gap="xs">
              <ThemeIcon size="sm" radius="md" color="blue" variant="light">
                <IconExternalLink size={14} />
              </ThemeIcon>
              <Text size="sm" fw={600}>Dev Servers</Text>
            </Group>

            <Group gap="sm" align="center" wrap="wrap">
              {session?.projects.map(projectName => {
                const config = projects[projectName];
                if (!config?.devServer?.url) return null;
                return (
                  <Button
                    key={projectName}
                    component="a"
                    href={config.devServer.url}
                    target="_blank"
                    variant="light"
                    color="blue"
                    size="xs"
                    leftSection={<IconExternalLink size={14} />}
                  >
                    {projectName}
                  </Button>
                );
              })}
              <Button
                variant="light"
                color="red"
                size="xs"
                leftSection={<IconPlayerStop size={14} />}
                onClick={stopSession}
              >
                Stop Dev Servers
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
