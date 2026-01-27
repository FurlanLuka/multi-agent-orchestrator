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
  Alert,
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
} from '@mantine/core';
// Note: ProjectStatus and AgentOutputPanel removed - replaced by unified ProjectCard
import '@mantine/core/styles.css';
import {
  IconRocket,
  IconMessageCircle,
  IconCheck,
  IconSparkles,
  IconClipboardList,
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconExternalLink,
  IconPlayerStop,
  IconGitBranch,
  IconUpload,
  IconGitMerge,
  IconSettings,
  IconPlayerPlay,
  IconPower,
} from '@tabler/icons-react';
import { useSocket } from './hooks/useSocket';
import { AssistantChat } from './components/AssistantChat';
import { ApprovalPanel } from './components/ApprovalPanel';
import { SessionSetup } from './components/SessionSetup';
import { ProjectManager } from './components/ProjectManager';
import { ProjectCard } from './components/ProjectCard';
// SessionSidebar hidden for now - session history navigation is broken
// import { SessionSidebar } from './components/SessionSidebar';
import { TabbedPlanView } from './components/TabbedPlanView';
import { SplashScreen } from './components/SplashScreen';

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
    pendingPlan,
    allComplete,
    projects,
    templates,
    creatingProject,
    addingProject,
    startingSession,
    sessions: _sessions,
    loadingSession,
    activeSessionId,
    viewingSessionId,
    sendChat,
    startSession,
    approvePlan,
    respondToApproval,
    createProjectFromTemplate,
    quickStartApp,
    addProject,
    removeProject,
    updateProject,
    deleteSession: _deleteSession,
    viewSession: _viewSession,
    stopSession,
    getSessions,
    clearSession: _clearSession,
    submitUserAction,
    pushingBranch,
    pushResults,
    pushBranch,
    mergingBranch,
    mergeResults,
    mergeBranch,
    recheckDependencies,
    permissionPrompt,
    respondToPermission,
  } = useSocket();

  const sessionProjects = session?.projects || Object.keys(statuses);
  const availableProjects = Object.keys(projects);
  const [showPlan, setShowPlan] = useState(true);  // Show plan by default
  const [showNewSession, setShowNewSession] = useState(false);
  const [quickStartName, setQuickStartName] = useState('');

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

  // Determine if we're in read-only mode (viewing a session that's not active)
  const isReadOnly = viewingSessionId !== null && viewingSessionId !== activeSessionId;

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

  // Handler for starting a new session
  // Handler for starting session (wraps startSession to hide form)
  const handleStartSession = (feature: string, projectList: string[], branchName?: string) => {
    startSession(feature, projectList, branchName);
    setShowNewSession(false);
    // Refresh sessions list
    getSessions();
  };

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
              {isReadOnly && (
                <Badge
                  variant="light"
                  color="orange"
                  size="lg"
                  radius="md"
                  leftSection={<IconEye size={14} />}
                >
                  Read-Only View
                </Badge>
              )}
              {activeSessionId && !isReadOnly && (
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

        {/* Session Sidebar - Hidden for now */}

        <AppShell.Main>
          <Container size="100%" py="md" h="calc(100vh - 80px)">
            {/* All Complete - Success Message Card */}
            {allComplete && (
              <Stack gap="md" mb="md">
                {/* Green Success Card */}
                <Alert
                  icon={<IconCheck size={20} />}
                  title="Feature Complete!"
                  color="green"
                  radius="md"
                  variant="light"
                  styles={{
                    root: {
                      border: '1px solid var(--mantine-color-green-3)',
                    },
                  }}
                >
                  <Text size="sm">All projects have completed their tasks successfully.</Text>
                </Alert>

                {/* Controls Card - Git Operations + Dev Server */}
                <Paper shadow="sm" radius="md" p="md" withBorder>
                  <Stack gap="md">
                    {/* Row 1: Git Operations */}
                    {session?.gitBranches && Object.keys(session.gitBranches).length > 0 && (
                      <Group gap="sm" align="center">
                        <Group gap="xs">
                          <IconGitBranch size={16} color="var(--mantine-color-violet-6)" />
                          <Text size="sm" fw={500} c="dimmed">Git:</Text>
                        </Group>
                        {Object.entries(session.gitBranches).map(([projectName, branchName]) => {
                          const isPushing = pushingBranch[projectName];
                          const pushResult = pushResults[projectName];
                          const isMerging = mergingBranch[projectName];
                          const mergeResult = mergeResults[projectName];
                          const mainBranch = projects[projectName]?.mainBranch || 'main';

                          // If merge succeeded, show merged badge
                          if (mergeResult?.success) {
                            return (
                              <Badge
                                key={projectName}
                                color="green"
                                variant="light"
                                leftSection={<IconGitMerge size={12} />}
                              >
                                {projectName}: Merged to {mainBranch}
                              </Badge>
                            );
                          }

                          // If push succeeded, show merge button
                          if (pushResult?.success) {
                            return (
                              <Group key={projectName} gap="xs">
                                <Badge
                                  color="green"
                                  variant="light"
                                  leftSection={<IconCheck size={12} />}
                                >
                                  {projectName}: Pushed
                                </Badge>
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
                              </Group>
                            );
                          }

                          // Show push button
                          return (
                            <Group key={projectName} gap="xs">
                              <Button
                                variant="light"
                                color="violet"
                                size="xs"
                                leftSection={isPushing ? undefined : <IconUpload size={14} />}
                                loading={isPushing}
                                onClick={() => pushBranch(projectName, branchName)}
                                disabled={isPushing}
                              >
                                <IconGitBranch size={12} style={{ marginRight: 4 }} />
                                {projectName}: {branchName}
                              </Button>
                              {pushResult && !pushResult.success && (
                                <Text size="xs" c="red">{pushResult.message}</Text>
                              )}
                            </Group>
                          );
                        })}
                      </Group>
                    )}

                    {/* Row 2: Dev Server Controls */}
                    <Group gap="sm" align="center">
                      <Group gap="xs">
                        <IconExternalLink size={16} color="var(--mantine-color-blue-6)" />
                        <Text size="sm" fw={500} c="dimmed">Dev Servers:</Text>
                      </Group>
                      {session?.projects.map(projectName => {
                        const config = projects[projectName];
                        if (!config) return null;
                        const url = config.devServer.url || `http://localhost:${config.devServer.port || 5173}`;
                        return (
                          <Button
                            key={projectName}
                            component="a"
                            href={url}
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
              </Stack>
            )}

            {/* Read-Only Banner */}
            {isReadOnly && session && (
              <Alert
                icon={<IconEye size={20} />}
                title="Viewing Session History"
                color="orange"
                mb="md"
                radius="md"
                variant="light"
                styles={{
                  root: {
                    border: '1px solid var(--mantine-color-orange-3)',
                  },
                }}
              >
                <Text size="sm">
                  This is a read-only view of a past session. Start a new session to continue working.
                </Text>
              </Alert>
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
                        sessions={[]}
                        onLoadSession={() => {}}
                        onDeleteSession={() => {}}
                        loadingSession={loadingSession}
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
                        pendingPlan={pendingPlan}
                        planningStatus={planningStatus}
                        activeFlows={activeFlows}
                        completedFlows={completedFlows}
                        onSendMessage={sendChat}
                        onApprovePlan={approvePlan}
                        sessionActive={!!session}
                        readOnly={isReadOnly}
                        permissionPrompt={permissionPrompt}
                        onPermissionResponse={respondToPermission}
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
                        <Group justify="space-between" align="flex-start">
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
                              {session.feature}
                            </Text>
                          </Stack>
                          <Group gap="sm">
                            {session.plan && (
                              <Button
                                variant="subtle"
                                size="xs"
                                color="gray"
                                onClick={() => setShowPlan(!showPlan)}
                                rightSection={showPlan ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                              >
                                {showPlan ? 'Hide Plan' : 'View Plan'}
                              </Button>
                            )}
                            <Badge variant="light" color="gray" size="sm" radius="md">
                              Started {new Date(session.startedAt).toLocaleTimeString()}
                            </Badge>
                          </Group>
                        </Group>

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
                                onSubmitUserAction={submitUserAction}
                              />
                            </Box>
                          </Collapse>
                        )}
                      </Paper>

                      {/* Project Cards */}
                      {sessionProjects.map(project => (
                        <ProjectCard
                          key={project}
                          project={project}
                          status={statuses[project]?.status || 'PENDING'}
                          message={statuses[project]?.message || ''}
                          updatedAt={statuses[project]?.updatedAt || 0}
                          logs={logsByProject[project] || []}
                          testState={testStates[project]}
                          permissionPrompt={permissionPrompt?.project === project ? {
                            toolName: permissionPrompt.toolName,
                            toolInput: permissionPrompt.toolInput
                          } : null}
                          onPermissionResponse={respondToPermission}
                        />
                      ))}
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
    </MantineProvider>
  );
}

export default App;
