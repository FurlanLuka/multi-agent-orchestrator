import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  MantineProvider,
  AppShell,
  Container,
  Stack,
  Title,
  Group,
  Badge,
  Text,
  Grid,
  Paper,
  Box,
  ThemeIcon,
  ScrollArea,
  Button,
  Collapse,
  Tabs,
  Card,
  TextInput,
  Switch,
  Tooltip,
  Select,
} from '@mantine/core';
// Note: ProjectStatus and AgentOutputPanel removed - replaced by unified ProjectCard
import '@mantine/core/styles.css';
import '@mantine/tiptap/styles.css';
import {
  IconRocket,
  IconMessageCircle,
  IconCheck,
  IconSparkles,
  IconClipboardList,
  IconChevronDown,
  IconChevronUp,
  IconExternalLink,
  IconPlayerStop,
  IconGitBranch,
  IconUpload,
  IconGitMerge,
  IconSettings,
  IconPlayerPlay,
  IconPower,
  IconGitPullRequest,
  IconRefresh,
} from '@tabler/icons-react';
import { useSocket } from './hooks/useSocket';
import { AssistantChat } from './components/AssistantChat';
import { ApprovalPanel } from './components/ApprovalPanel';
import { SessionSetup } from './components/SessionSetup';
import { ProjectManager } from './components/ProjectManager';
import { ProjectCard } from './components/ProjectCard';
import { TabbedPlanView } from './components/TabbedPlanView';
import { MarkdownMessage } from './components/MarkdownMessage';
import { SplashScreen } from './components/SplashScreen';
import { UserInputOverlay } from './components/UserInputOverlay';

function App() {
  const {
    port,
    connected,
    checkingDependencies,
    dependencyCheck,
    backendError,
    session,
    statuses,
    logs,
    streamingMessages,
    testStates,
    taskStates,
    planningStatus,
    activeFlows,
    completedFlows,
    currentApproval,
    allComplete,
    projects,
    templates,
    creatingProject,
    addingProject,
    startingSession,
    activeSessionId,
    sendChat,
    startSession,
    respondToApproval,
    createProjectFromTemplate,
    quickStartApp,
    addProject,
    removeProject,
    updateProject,
    stopSession,
    startNewSession,
    submitUserInput,
    userInputRequest,
    pushingBranch,
    pushResults,
    pushBranch,
    mergingBranch,
    mergeResults,
    mergeBranch,
    creatingPR,
    prResults,
    gitHubInfo,
    availableBranches,
    loadingBranches,
    getGitHubInfo,
    createPR,
    getBranches,
    recheckDependencies,
    permissionPrompt,
    respondToPermission,
    planningQuestion,
    answerPlanningQuestion,
    pendingPlanApproval,
    approvePlanViaChat,
    refinePlan,
    retryProject,
    retryPlan,
  } = useSocket();

  const sessionProjects = session?.projects || Object.keys(statuses);
  const availableProjects = Object.keys(projects);
  const [showPlan, setShowPlan] = useState(true);  // Show plan by default
  const [showInitialPrompt, setShowInitialPrompt] = useState(false);
  const [showNewSession, setShowNewSession] = useState(false);
  const [quickStartName, setQuickStartName] = useState('');
  // Selected base branch for PR creation per project
  const [prBaseBranch, setPrBaseBranch] = useState<Record<string, string>>({});

  // Shutdown on close preference (persisted to localStorage)
  const [shutdownOnClose, setShutdownOnClose] = useState(() => {
    return localStorage.getItem('aio-shutdown-on-close') === 'true';
  });

  // Handle shutdown on close toggle
  const handleShutdownOnCloseChange = useCallback((checked: boolean) => {
    setShutdownOnClose(checked);
    localStorage.setItem('aio-shutdown-on-close', String(checked));
  }, []);

  // Shutdown server function
  const shutdownServer = useCallback(() => {
    if (port) {
      navigator.sendBeacon(`http://localhost:${port}/api/shutdown`, '');
    }
  }, [port]);

  // Handle beforeunload - prompt user if shutdownOnClose is enabled
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (shutdownOnClose && session) {
        // Show browser's native "Leave site?" dialog
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    const handleUnload = () => {
      if (shutdownOnClose) {
        shutdownServer();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, [shutdownOnClose, session, shutdownServer]);

  // Fetch GitHub info when session completes with git branches
  useEffect(() => {
    if (allComplete && session?.gitBranches) {
      Object.keys(session.gitBranches).forEach(project => {
        // Only fetch if we don't already have the info
        if (!gitHubInfo[project]) {
          getGitHubInfo(project);
        }
      });
    }
  }, [allComplete, session?.gitBranches, gitHubInfo, getGitHubInfo]);

  // Memoize expensive computations
  const isStreaming = useMemo(
    () => streamingMessages.some(m => m.status === 'streaming'),
    [streamingMessages]
  );

  // Memoize logs by project to avoid filtering on every render
  const logsByProject = useMemo(() => {
    const grouped: Record<string, typeof logs> = {};
    for (const log of logs) {
      if (!grouped[log.project]) {
        grouped[log.project] = [];
      }
      grouped[log.project].push(log);
    }
    return grouped;
  }, [logs]);

  // Handler for starting session (wraps startSession to hide form)
  const handleStartSession = (feature: string, projectList: string[], branchName?: string) => {
    startSession(feature, projectList, branchName);
    setShowNewSession(false);
  };

  // Handler for retrying plan generation after failure
  const handleRetryPlan = useCallback(() => {
    if (session?.feature) {
      retryPlan(session.feature);
    }
  }, [session, retryPlan]);

  // Handler for retrying a failed project
  const handleRetryProject = useCallback((project: string) => {
    retryProject(project);
  }, [retryProject]);

  // Show splash screen while checking dependencies, if Claude is not available, or if there's a backend error
  if (checkingDependencies || backendError || (dependencyCheck && !dependencyCheck.claude.available)) {
    return (
      <MantineProvider defaultColorScheme="light">
        <SplashScreen
          checking={checkingDependencies}
          dependencyCheck={dependencyCheck}
          backendError={backendError}
          onRetry={recheckDependencies}
        />
      </MantineProvider>
    );
  }

  return (
    <MantineProvider defaultColorScheme="light">
      <AppShell
        header={{ height: 64 }}
        padding="md"
        styles={{
          root: {
            minHeight: '100%',
          },
          main: {
            backgroundColor: 'var(--mantine-color-gray-0)',
            minHeight: 'calc(100vh - 64px)',
          },
        }}
      >
        <AppShell.Header
          p="md"
          style={{
            borderBottom: '1px solid var(--mantine-color-gray-2)',
            backgroundColor: 'white',
          }}
        >
          <Group justify="space-between" h="100%">
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
                <IconRocket size={20} />
              </ThemeIcon>
              <Title order={3} style={{ fontWeight: 700 }}>
                Multi-Agent Orchestrator
              </Title>
            </Group>
            <Group gap="md">
              {activeSessionId && (
                <Badge
                  variant="light"
                  color="blue"
                  size="lg"
                  radius="md"
                  leftSection={<IconSparkles size={14} />}
                >
                  Session Active
                </Badge>
              )}
              <Tooltip label="When enabled, closing this tab will also stop the server">
                <Group gap="xs">
                  <IconPower size={16} style={{ color: shutdownOnClose ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-gray-5)' }} />
                  <Switch
                    size="sm"
                    checked={shutdownOnClose}
                    onChange={(e) => handleShutdownOnCloseChange(e.currentTarget.checked)}
                    label="Stop server on close"
                    styles={{ label: { fontSize: '12px', color: 'var(--mantine-color-gray-6)' } }}
                  />
                </Group>
              </Tooltip>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Main>
          <Container size="100%" py="md" h="calc(100vh - 80px)">
            {/* All Complete - Split into 3 Cards */}
            {allComplete && (
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
                                  {/* Only show merge button for non-GitHub projects - enforce PR workflow for GitHub */}
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
            )}

            {/* No Session or New Session Form - Show Quick Start + Tabbed Setup */}
            {(!session || showNewSession) && (
              <Box maw={1200} mx="auto">
              <Stack gap="xl">
                {/* Quick Start */}
                <Card
                  shadow="sm"
                  radius="lg"
                  p="xl"
                  style={{
                    background: 'linear-gradient(135deg, var(--mantine-color-violet-0) 0%, var(--mantine-color-blue-0) 100%)',
                    border: '1px solid var(--mantine-color-violet-2)',
                  }}
                >
                  <Stack gap="md">
                    <Group gap="md">
                      <ThemeIcon size={48} radius="md" variant="gradient" gradient={{ from: 'violet', to: 'blue' }}>
                        <IconRocket size={28} />
                      </ThemeIcon>
                      <div>
                        <Title order={3}>Quick Start</Title>
                        <Text size="sm" c="dimmed">
                          Create a full-stack app with frontend + backend, Git, and E2E testing.
                        </Text>
                      </div>
                    </Group>

                    <Stack gap="sm">
                      <TextInput
                        placeholder="App name (e.g., blog, shop, dashboard)"
                        value={quickStartName}
                        onChange={(e) => setQuickStartName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        disabled={creatingProject}
                        size="md"
                      />
                      {quickStartName && (
                        <Text size="xs" c="dimmed">
                          Creates <Text span fw={500} c="violet">~/Documents/aio-{quickStartName}/{quickStartName}-frontend</Text> and <Text span fw={500} c="blue">~/Documents/aio-{quickStartName}/{quickStartName}-backend</Text>
                        </Text>
                      )}
                      <Button
                        size="md"
                        variant="gradient"
                        gradient={{ from: 'violet', to: 'blue' }}
                        leftSection={<IconRocket size={18} />}
                        disabled={!quickStartName.trim() || creatingProject}
                        loading={creatingProject}
                        onClick={() => {
                          if (quickStartName.trim()) {
                            quickStartApp(quickStartName.trim());
                            setQuickStartName('');
                          }
                        }}
                      >
                        Create App
                      </Button>
                    </Stack>
                  </Stack>
                </Card>

                {/* Tabbed Content */}
                <Paper shadow="sm" radius="lg" p="lg" withBorder>
                  <Tabs defaultValue="session" variant="default">
                    <Tabs.List mb="lg">
                      <Tabs.Tab value="session" leftSection={<IconPlayerPlay size={16} />} fw={500}>
                        Start Session
                      </Tabs.Tab>
                      <Tabs.Tab value="projects" leftSection={<IconSettings size={16} />} fw={500}>
                        Project Configuration
                      </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="session">
                      <SessionSetup
                        availableProjects={availableProjects}
                        projectConfigs={projects}
                        onStartSession={handleStartSession}
                        connected={connected}
                        startingSession={startingSession}
                      />
                      {showNewSession && (
                        <Button
                          variant="subtle"
                          color="gray"
                          mt="md"
                          onClick={() => setShowNewSession(false)}
                        >
                          Cancel
                        </Button>
                      )}
                    </Tabs.Panel>

                    <Tabs.Panel value="projects">
                      <ProjectManager
                        projects={projects}
                        templates={templates}
                        creatingProject={creatingProject}
                        addingProject={addingProject}
                        gitAvailable={dependencyCheck?.git.available ?? true}
                        port={port}
                        onCreateProject={createProjectFromTemplate}
                        onAddProject={addProject}
                        onRemoveProject={removeProject}
                        onUpdateProject={updateProject}
                      />
                    </Tabs.Panel>
                  </Tabs>
                </Paper>
              </Stack>
              </Box>
            )}

            {/* Active Session - Split Panel Layout */}
            {session && !showNewSession && (
              <Grid gutter="lg" h="100%">
                {/* LEFT PANEL: Planning Chat (Full width before plan approval, 5/12 after) */}
                <Grid.Col
                  span={{ base: 12, lg: session.plan ? 5 : 12 }}
                  style={{ minWidth: 380 }}
                >
                  <Paper
                    shadow="sm"
                    radius="lg"
                    p={0}
                    h="calc(100vh - 120px)"
                    style={{
                      overflow: 'hidden',
                      border: '1px solid var(--mantine-color-gray-2)',
                      background: 'linear-gradient(135deg, white 0%, var(--mantine-color-gray-0) 100%)',
                    }}
                  >
                    {/* Chat Header */}
                    <Group justify="space-between" p="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', backgroundColor: 'white' }}>
                      <Group gap="xs">
                        <ThemeIcon size="sm" radius="md" variant="light" color="blue">
                          <IconMessageCircle size={14} />
                        </ThemeIcon>
                        <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                          Planning Agent
                        </Text>
                      </Group>
                      <Badge
                        color={isStreaming ? 'blue' : 'gray'}
                        variant="light"
                        size="sm"
                        radius="md"
                      >
                        {isStreaming ? 'Thinking...' : 'Ready'}
                      </Badge>
                    </Group>
                    <Box h="calc(100% - 57px)">
                      <AssistantChat
                        messages={streamingMessages}
                        planningStatus={planningStatus}
                        activeFlows={activeFlows}
                        completedFlows={completedFlows}
                        onSendMessage={sendChat}
                        onRetryPlan={handleRetryPlan}
                        sessionActive={!!session}
                        executionStarted={!!session?.plan}
                        permissionPrompt={permissionPrompt}
                        onPermissionResponse={respondToPermission}
                        planningQuestion={planningQuestion}
                        onAnswerPlanningQuestion={answerPlanningQuestion}
                        pendingPlanApproval={pendingPlanApproval}
                        onApprovePlanViaChat={approvePlanViaChat}
                        onRefinePlan={refinePlan}
                      />
                    </Box>
                  </Paper>
                </Grid.Col>

                {/* RIGHT PANEL: Status + Outputs (Only shown after plan approval) */}
                {session.plan && (
                <Grid.Col span={{ base: 12, lg: 7 }}>
                  <ScrollArea h="calc(100vh - 120px)" type="auto" offsetScrollbars>
                    <Stack gap="md">
                      {/* Feature Header Card */}
                      <Paper
                        shadow="sm"
                        radius="lg"
                        p="lg"
                        style={{
                          border: '1px solid var(--mantine-color-gray-2)',
                          background: 'linear-gradient(135deg, white 0%, var(--mantine-color-gray-0) 100%)',
                        }}
                      >
                        <Stack gap="xs">
                          <Group gap="xs">
                            <ThemeIcon size="sm" radius="md" variant="light" color="violet">
                              <IconClipboardList size={14} />
                            </ThemeIcon>
                            <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                              Current Feature
                            </Text>
                          </Group>
                          <Text fw={700} size="lg" style={{ lineHeight: 1.3 }}>
                            {session.plan?.feature || session.feature}
                          </Text>
                          <Group gap="sm">
                            {session.plan && (
                              <Group gap={4}>
                                <Button
                                  variant="subtle"
                                  size="xs"
                                  color="gray"
                                  onClick={() => setShowPlan(!showPlan)}
                                  rightSection={showPlan ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                                >
                                  {showPlan ? 'Hide Plan' : 'View Plan'}
                                </Button>
                                <Text c="dimmed" size="xs">|</Text>
                                <Button
                                  variant="subtle"
                                  size="xs"
                                  color="gray"
                                  onClick={() => setShowInitialPrompt(!showInitialPrompt)}
                                  rightSection={showInitialPrompt ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                                >
                                  {showInitialPrompt ? 'Hide Prompt' : 'Show Prompt'}
                                </Button>
                              </Group>
                            )}
                            <Badge variant="light" color="gray" size="sm" radius="md">
                              Started {new Date(session.startedAt).toLocaleTimeString()}
                            </Badge>
                          </Group>
                        </Stack>

                        {/* Collapsible Initial Prompt */}
                        {session.plan && (
                          <Collapse in={showInitialPrompt}>
                            <Box
                              mt="md"
                              pt="md"
                              style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}
                            >
                              <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
                                Initial Prompt
                              </Text>
                              <Box
                                p="sm"
                                style={{
                                  backgroundColor: 'var(--mantine-color-gray-0)',
                                  borderRadius: 'var(--mantine-radius-sm)',
                                }}
                              >
                                <MarkdownMessage content={session.feature} />
                              </Box>
                            </Box>
                          </Collapse>
                        )}

                        {/* Collapsible Plan Details - Now using TabbedPlanView */}
                        {session.plan && (
                          <Collapse in={showPlan}>
                            <Box
                              mt="md"
                              pt="md"
                              style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}
                            >
                              <TabbedPlanView
                                plan={session.plan}
                                taskStates={taskStates}
                                testStates={testStates}
                                isApproval={false}
                              />
                            </Box>
                          </Collapse>
                        )}
                      </Paper>

                      {/* Project Cards */}
                      {sessionProjects.map(project => {
                        const projectStatus = statuses[project]?.status || 'PENDING';
                        return (
                          <ProjectCard
                            key={project}
                            project={project}
                            status={projectStatus}
                            message={statuses[project]?.message || ''}
                            updatedAt={statuses[project]?.updatedAt || 0}
                            logs={logsByProject[project] || []}
                            testState={testStates[project]}
                            permissionPrompt={permissionPrompt?.project === project ? {
                              toolName: permissionPrompt.toolName,
                              toolInput: permissionPrompt.toolInput
                            } : null}
                            onPermissionResponse={respondToPermission}
                            onRetry={
                              (projectStatus === 'FATAL_DEBUGGING' || projectStatus === 'FAILED')
                                ? () => handleRetryProject(project)
                                : undefined
                            }
                          />
                        );
                      })}
                    </Stack>
                  </ScrollArea>
                </Grid.Col>
                )}
              </Grid>
            )}
          </Container>
        </AppShell.Main>
      </AppShell>

      {/* Approval Modal */}
      <ApprovalPanel
        approval={currentApproval}
        onRespond={respondToApproval}
      />

      {/* User Input Overlay (for request_user_input MCP tool) */}
      {userInputRequest && (
        <Box
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
          }}
        >
          <UserInputOverlay
            request={userInputRequest}
            onSubmit={submitUserInput}
          />
        </Box>
      )}
    </MantineProvider>
  );
}

export default App;
