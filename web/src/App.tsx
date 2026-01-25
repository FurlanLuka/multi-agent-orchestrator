import { useState, useMemo } from 'react';
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
  Loader,
  ScrollArea,
  Button,
  Collapse,
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
} from '@tabler/icons-react';
import { useSocket } from './hooks/useSocket';
import { AssistantChat } from './components/AssistantChat';
import { ApprovalPanel } from './components/ApprovalPanel';
import { SessionSetup } from './components/SessionSetup';
import { ProjectManager } from './components/ProjectManager';
import { ProjectCard } from './components/ProjectCard';
import { SessionSidebar } from './components/SessionSidebar';
import { TabbedPlanView } from './components/TabbedPlanView';

function App() {
  const {
    connected,
    session,
    statuses,
    logs,
    streamingMessages,
    queueStatus,
    testStates,
    taskStates,
    planningStatus,
    chatEvents,
    currentApproval,
    pendingPlan,
    allComplete,
    projects,
    templates,
    creatingProject,
    addingProject,
    sessions,
    loadingSession,
    activeSessionId,
    viewingSessionId,
    sendChat,
    startSession,
    approvePlan,
    respondToApproval,
    createProjectFromTemplate,
    addProject,
    removeProject,
    updateProject,
    deleteSession,
    viewSession,
    stopSession,
    getSessions,
    clearSession,
  } = useSocket();

  const sessionProjects = session?.projects || Object.keys(statuses);
  const availableProjects = Object.keys(projects);
  const [showPlan, setShowPlan] = useState(true);  // Show plan by default
  const [showNewSession, setShowNewSession] = useState(false);

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
  const handleNewSession = () => {
    clearSession(); // Clear viewing state so we don't show read-only indicators
    setShowNewSession(true);
  };

  // Handler for starting session (wraps startSession to hide form)
  const handleStartSession = (feature: string, projectList: string[]) => {
    startSession(feature, projectList);
    setShowNewSession(false);
    // Refresh sessions list
    getSessions();
  };

  return (
    <MantineProvider defaultColorScheme="light">
      <AppShell
        header={{ height: 64 }}
        navbar={{
          width: 300,
          breakpoint: 'sm',
        }}
        padding="md"
        styles={{
          main: {
            backgroundColor: 'var(--mantine-color-gray-0)',
            minHeight: '100vh',
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
              <Badge
                color={connected ? 'green' : 'red'}
                variant="dot"
                size="lg"
                radius="md"
              >
                {connected ? 'Connected' : 'Disconnected'}
              </Badge>
            </Group>
          </Group>
        </AppShell.Header>

        {/* Session Sidebar */}
        <AppShell.Navbar p="sm" style={{ backgroundColor: 'white' }}>
          <SessionSidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            viewingSessionId={viewingSessionId}
            connected={connected}
            onNewSession={handleNewSession}
            onViewSession={viewSession}
            onDeleteSession={deleteSession}
            onStopSession={stopSession}
          />
        </AppShell.Navbar>

        <AppShell.Main>
          <Container size="100%" py="md" h="calc(100vh - 80px)">
            {/* All Complete Banner */}
            {allComplete && (
              <Alert
                icon={<IconCheck size={20} />}
                title="Feature Complete!"
                color="green"
                mb="md"
                radius="md"
                variant="light"
                styles={{
                  root: {
                    border: '1px solid var(--mantine-color-green-3)',
                  },
                }}
              >
                All projects have completed their tasks successfully.
              </Alert>
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

            {/* No Session or New Session Form - Show Setup + Project Manager */}
            {(!session || showNewSession) && (
              <Grid gutter="lg">
                <Grid.Col span={{ base: 12, md: 7 }}>
                  <SessionSetup
                    availableProjects={availableProjects}
                    onStartSession={handleStartSession}
                    connected={connected}
                    sessions={[]}
                    onLoadSession={() => {}}
                    onDeleteSession={() => {}}
                    loadingSession={loadingSession}
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
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 5 }}>
                  <ProjectManager
                    projects={projects}
                    templates={templates}
                    creatingProject={creatingProject}
                    addingProject={addingProject}
                    onCreateProject={createProjectFromTemplate}
                    onAddProject={addProject}
                    onRemoveProject={removeProject}
                    onUpdateProject={updateProject}
                  />
                </Grid.Col>
              </Grid>
            )}

            {/* Active Session - Split Panel Layout */}
            {session && !showNewSession && (
              <Grid gutter="lg" h="100%">
                {/* LEFT PANEL: Planning Chat (Always Visible) */}
                <Grid.Col
                  span={{ base: 12, lg: 5 }}
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
                        queueStatus={queueStatus}
                        planningStatus={planningStatus}
                        chatEvents={chatEvents}
                        onSendMessage={sendChat}
                        onApprovePlan={approvePlan}
                        sessionActive={!!session}
                        readOnly={isReadOnly}
                      />
                    </Box>
                  </Paper>
                </Grid.Col>

                {/* RIGHT PANEL: Status + Outputs */}
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
                              />
                            </Box>
                          </Collapse>
                        )}
                      </Paper>

                      {/* Pre-approval: Waiting State */}
                      {!session.plan && !pendingPlan && (
                        <Paper
                          shadow="sm"
                          radius="lg"
                          p="xl"
                          style={{
                            border: '1px solid var(--mantine-color-gray-2)',
                          }}
                        >
                          <Stack align="center" gap="lg" py="xl">
                            <ThemeIcon
                              size={64}
                              radius="xl"
                              variant="light"
                              color="blue"
                            >
                              <Loader size={32} color="blue" />
                            </ThemeIcon>
                            <Stack align="center" gap="xs">
                              <Text fw={600} size="lg">
                                Planning Agent is Analyzing
                              </Text>
                              <Text c="dimmed" ta="center" maw={400}>
                                The Planning Agent is exploring your codebase and creating an execution plan for your feature request.
                              </Text>
                            </Stack>
                          </Stack>
                        </Paper>
                      )}

                      {/* Pending Plan Hint */}
                      {pendingPlan && (
                        <Alert
                          icon={<IconMessageCircle size={20} />}
                          title="Plan Ready for Review"
                          color="yellow"
                          radius="md"
                          variant="light"
                          styles={{
                            root: {
                              border: '1px solid var(--mantine-color-yellow-3)',
                            },
                          }}
                        >
                          Review the execution plan in the chat panel and click "Approve & Start" to begin.
                        </Alert>
                      )}

                      {/* Post-approval: Unified Project Cards */}
                      {session.plan && (
                        <>
                          {/* One card per project with status + logs */}
                          {sessionProjects.map(project => (
                            <ProjectCard
                              key={project}
                              project={project}
                              status={statuses[project]?.status || 'PENDING'}
                              message={statuses[project]?.message || ''}
                              updatedAt={statuses[project]?.updatedAt || 0}
                              logs={logsByProject[project] || []}
                              testState={testStates[project]}
                            />
                          ))}
                        </>
                      )}
                    </Stack>
                  </ScrollArea>
                </Grid.Col>
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
