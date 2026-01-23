import { useState } from 'react';
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
  Accordion,
  Box,
  ThemeIcon,
  Loader,
  ScrollArea,
  Button,
  Collapse,
  List,
} from '@mantine/core';
// Note: ProjectStatus and AgentOutputPanel removed - replaced by unified ProjectCard
import '@mantine/core/styles.css';
import {
  IconRocket,
  IconMessageCircle,
  IconFileText,
  IconCheck,
  IconSparkles,
  IconBrain,
  IconClipboardList,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react';
import { useSocket } from './hooks/useSocket';
import { AssistantChat } from './components/AssistantChat';
import { LogViewer } from './components/LogViewer';
import { ApprovalPanel } from './components/ApprovalPanel';
import { SessionSetup } from './components/SessionSetup';
import { ProjectManager } from './components/ProjectManager';
import { ProjectCard } from './components/ProjectCard';

function App() {
  const {
    connected,
    session,
    statuses,
    logs,
    streamingMessages,
    queueStatus,
    currentApproval,
    pendingPlan,
    allComplete,
    projects,
    templates,
    creatingProject,
    sendChat,
    startSession,
    approvePlan,
    respondToApproval,
    clearLogs,
    createProjectFromTemplate,
  } = useSocket();

  const sessionProjects = session?.projects || Object.keys(statuses);
  const availableProjects = Object.keys(projects);
  const [showPlan, setShowPlan] = useState(false);

  return (
    <MantineProvider defaultColorScheme="light">
      <AppShell
        header={{ height: 64 }}
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
              {session && (
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

            {/* No Session - Show Setup + Project Manager */}
            {!session && (
              <Grid gutter="lg">
                <Grid.Col span={{ base: 12, md: 7 }}>
                  <SessionSetup
                    availableProjects={availableProjects}
                    onStartSession={startSession}
                    connected={connected}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 5 }}>
                  <ProjectManager
                    projects={projects}
                    templates={templates}
                    creatingProject={creatingProject}
                    onCreateProject={createProjectFromTemplate}
                  />
                </Grid.Col>
              </Grid>
            )}

            {/* Active Session - Split Panel Layout */}
            {session && (
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
                    }}
                  >
                    {/* Chat Header */}
                    <Box
                      p="md"
                      style={{
                        borderBottom: '1px solid var(--mantine-color-gray-2)',
                        background: 'linear-gradient(135deg, var(--mantine-color-blue-0) 0%, var(--mantine-color-cyan-0) 100%)',
                      }}
                    >
                      <Group gap="sm">
                        <ThemeIcon size="md" radius="md" variant="light" color="blue">
                          <IconBrain size={16} />
                        </ThemeIcon>
                        <Text fw={600} size="sm">Planning Agent</Text>
                        {streamingMessages.some(m => m.status === 'streaming') && (
                          <Badge size="xs" color="blue" variant="dot">
                            Thinking...
                          </Badge>
                        )}
                      </Group>
                    </Box>
                    <Box h="calc(100% - 56px)">
                      <AssistantChat
                        messages={streamingMessages}
                        pendingPlan={pendingPlan}
                        queueStatus={queueStatus}
                        onSendMessage={sendChat}
                        onApprovePlan={approvePlan}
                        sessionActive={!!session}
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

                        {/* Collapsible Plan Details */}
                        {session.plan && (
                          <Collapse in={showPlan}>
                            <Box
                              mt="md"
                              pt="md"
                              style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}
                            >
                              <Stack gap="md">
                                {/* Plan Description */}
                                {session.plan.description && (
                                  <Box>
                                    <Text size="xs" fw={600} c="dimmed" mb="xs">Description</Text>
                                    <Text size="sm">{session.plan.description}</Text>
                                  </Box>
                                )}

                                {/* Tasks by Project */}
                                <Box>
                                  <Text size="xs" fw={600} c="dimmed" mb="xs">Tasks</Text>
                                  <Stack gap="sm">
                                    {session.plan.tasks.map((task, idx) => (
                                      <Box
                                        key={idx}
                                        p="sm"
                                        style={{
                                          backgroundColor: 'var(--mantine-color-gray-0)',
                                          borderRadius: 'var(--mantine-radius-md)',
                                          border: '1px solid var(--mantine-color-gray-2)',
                                        }}
                                      >
                                        <Group gap="xs" mb="xs">
                                          <Badge size="xs" variant="light" color="blue">
                                            {task.project}
                                          </Badge>
                                          {task.dependencies.length > 0 && (
                                            <Text size="xs" c="dimmed">
                                              depends on: {task.dependencies.join(', ')}
                                            </Text>
                                          )}
                                        </Group>
                                        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                                          {task.task}
                                        </Text>
                                      </Box>
                                    ))}
                                  </Stack>
                                </Box>

                                {/* Test Plan */}
                                {session.plan.testPlan && Object.keys(session.plan.testPlan).length > 0 && (
                                  <Box>
                                    <Text size="xs" fw={600} c="dimmed" mb="xs">Test Plan</Text>
                                    <Stack gap="xs">
                                      {Object.entries(session.plan.testPlan).map(([project, scenarios]) => (
                                        <Box key={project}>
                                          <Badge size="xs" variant="light" color="teal" mb="xs">
                                            {project}
                                          </Badge>
                                          <List size="sm" spacing="xs">
                                            {scenarios.map((scenario, idx) => (
                                              <List.Item key={idx}>{scenario}</List.Item>
                                            ))}
                                          </List>
                                        </Box>
                                      ))}
                                    </Stack>
                                  </Box>
                                )}
                              </Stack>
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
                              updatedAt={statuses[project]?.updatedAt || Date.now()}
                              logs={logs.filter(l => l.project === project)}
                            />
                          ))}

                          {/* Collapsible Full Logs (all projects combined) */}
                          <Accordion
                            variant="contained"
                            radius="lg"
                            styles={{
                              item: {
                                border: '1px solid var(--mantine-color-gray-2)',
                                backgroundColor: 'white',
                              },
                              control: {
                                padding: 'var(--mantine-spacing-md)',
                              },
                            }}
                          >
                            <Accordion.Item value="logs">
                              <Accordion.Control
                                icon={
                                  <ThemeIcon size="sm" radius="md" variant="light" color="gray">
                                    <IconFileText size={14} />
                                  </ThemeIcon>
                                }
                              >
                                <Group gap="xs">
                                  <Text fw={600} size="sm">All Logs</Text>
                                  <Badge size="xs" variant="light" color="gray">
                                    {logs.length} entries
                                  </Badge>
                                </Group>
                              </Accordion.Control>
                              <Accordion.Panel>
                                <LogViewer
                                  logs={logs}
                                  projects={sessionProjects}
                                  onClearLogs={clearLogs}
                                />
                              </Accordion.Panel>
                            </Accordion.Item>
                          </Accordion>
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
