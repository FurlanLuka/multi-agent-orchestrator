import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  AppShell,
  Container,
  Stack,
  Group,
  Text,
  Grid,
  Paper,
  Box,
  ThemeIcon,
  ScrollArea,
  Button,
  Collapse,
  Tabs,
  Badge,
} from '@mantine/core';
import {
  IconMessageCircle,
  IconClipboardList,
  IconChevronDown,
  IconChevronUp,
  IconSettings,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { useOrchestrator } from './context/OrchestratorContext';
import { AssistantChat } from './components/AssistantChat';
import { ApprovalPanel } from './components/ApprovalPanel';
import { SessionSetup } from './components/SessionSetup';
import { ProjectManager } from './components/ProjectManager';
import { ProjectCard } from './components/ProjectCard';
import { TabbedPlanView } from './components/TabbedPlanView';
import { MarkdownMessage } from './components/MarkdownMessage';
import { SplashScreen } from './components/SplashScreen';
import { UserInputOverlay } from './components/UserInputOverlay';
import { AppHeader } from './components/layout/AppHeader';
import { QuickStartCard } from './components/session/QuickStartCard';
import { CompletionPanel } from './components/session/CompletionPanel';

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
    currentApproval,
    allComplete,
    projects,
    templates,
    creatingProject,
    addingProject,
    startingSession,
    activeSessionId,
    startSession,
    respondToApproval,
    createProjectFromTemplate,
    quickStartApp,
    addProject,
    removeProject,
    updateProject,
    submitUserInput,
    userInputRequest,
    recheckDependencies,
    permissionPrompt,
    respondToPermission,
    retryProject,
  } = useOrchestrator();

  const sessionProjects = session?.projects || Object.keys(statuses);
  const availableProjects = Object.keys(projects);
  const [showPlan, setShowPlan] = useState(true);
  const [showInitialPrompt, setShowInitialPrompt] = useState(false);
  const [showNewSession, setShowNewSession] = useState(false);

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

  // Handle beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (shutdownOnClose && session) {
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

  // Memoize expensive computations
  const isStreaming = useMemo(
    () => streamingMessages.some(m => m.status === 'streaming'),
    [streamingMessages]
  );

  // Memoize logs by project
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

  // Handler for starting session
  const handleStartSession = (feature: string, projectList: string[], branchName?: string) => {
    startSession(feature, projectList, branchName);
    setShowNewSession(false);
  };

  // Handler for retrying a failed project
  const handleRetryProject = useCallback((project: string) => {
    retryProject(project);
  }, [retryProject]);

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

  return (
    <AppShell
      header={{ height: 64 }}
      padding="md"
      styles={{
        root: { minHeight: '100%' },
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
        <AppHeader
          activeSessionId={activeSessionId}
          shutdownOnClose={shutdownOnClose}
          onShutdownOnCloseChange={handleShutdownOnCloseChange}
        />
      </AppShell.Header>

      <AppShell.Main>
        <Container size="100%" py="md" h="calc(100vh - 80px)">
          {/* All Complete */}
          {allComplete && <CompletionPanel />}

          {/* No Session or New Session Form */}
          {(!session || showNewSession) && (
            <Box maw={1200} mx="auto">
              <Stack gap="xl">
                <QuickStartCard
                  creatingProject={creatingProject}
                  onQuickStart={quickStartApp}
                />

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
              {/* LEFT PANEL: Planning Chat */}
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
                    <AssistantChat />
                  </Box>
                </Paper>
              </Grid.Col>

              {/* RIGHT PANEL: Status + Outputs */}
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

                        {/* Collapsible Plan Details */}
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

      {/* Approval Modal */}
      <ApprovalPanel
        approval={currentApproval}
        onRespond={respondToApproval}
      />

      {/* User Input Overlay */}
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
    </AppShell>
  );
}

export default App;
