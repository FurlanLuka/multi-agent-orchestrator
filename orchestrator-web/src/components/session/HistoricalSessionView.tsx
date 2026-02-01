import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Stack,
  Group,
  Text,
  Box,
  ThemeIcon,
  Button,
  Collapse,
  Badge,
  Title,
  Loader,
  UnstyledButton,
  Tabs,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconMinus,
  IconApi,
  IconBulb,
} from '@tabler/icons-react';
import type {
  PersistedSession,
  StreamingMessage,
  RequestFlow,
  SessionCompletionReason,
} from '@orchy/types';
import { MarkdownMessage } from '../MarkdownMessage';
import { MermaidDiagram } from '../MermaidDiagram';
import { TaskList } from '../plan/TaskList';
import { TestList } from '../plan/TestList';
import { GlassCard, TabbedCard } from '../../theme';
import { BackButton } from '../BackButton';
import { ChatTimeline } from '../chat/ChatTimeline';
import type { ChatTimelineData } from '../chat/ChatTimeline';

function getCompletionReason(session: PersistedSession): SessionCompletionReason {
  if (session.status === 'interrupted') return 'interrupted';

  const failedTasks = session.taskStates?.filter(t => t.status === 'failed') || [];
  if (failedTasks.length > 0) return 'task_errors';

  const hasTestErrors = Object.values(session.testStates || {}).some(
    ts => ts.scenarios.some(s => s.status === 'failed')
  );
  if (hasTestErrors) return 'test_errors';

  return 'all_completed';
}

function getCompletionBadge(reason: SessionCompletionReason) {
  switch (reason) {
    case 'all_completed':
      return { color: 'green', icon: <IconCheck size={14} />, label: 'Completed Successfully' };
    case 'task_errors':
      return { color: 'red', icon: <IconX size={14} />, label: 'Task Errors' };
    case 'test_errors':
      return { color: 'orange', icon: <IconAlertTriangle size={14} />, label: 'Test Errors' };
    case 'interrupted':
      return { color: 'gray', icon: <IconMinus size={14} />, label: 'Interrupted' };
  }
}

export function HistoricalSessionView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<PersistedSession | null>(null);
  const [chatMessages, setChatMessages] = useState<StreamingMessage[]>([]);
  const [flows, setFlows] = useState<RequestFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showOverview, setShowOverview] = useState(true);
  const [showArchitecture, setShowArchitecture] = useState(false);
  const [architectureValid, setArchitectureValid] = useState(true);
  const [activeTab, setActiveTab] = useState<string | null>('overview');

  useEffect(() => {
    const fetchSession = async () => {
      if (!sessionId) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch session');
        }
        const data = await response.json();
        setSession(data.session);
        setChatMessages(data.chatMessages || []);
        setFlows(data.flows || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [sessionId]);

  // Prepare chat timeline data for the ChatTimeline component
  const chatTimelineData: ChatTimelineData = useMemo(() => ({
    messages: chatMessages,
    flows,
    activeFlows: [],  // No active flows in historical view
    completedFlows: flows,  // All flows are completed in historical view
  }), [chatMessages, flows]);

  // Get unique projects from tasks
  const planProjects = useMemo(() => {
    if (!session?.plan?.tasks) return [];
    return [...new Set(session.plan.tasks.map(t => t.project))];
  }, [session?.plan?.tasks]);

  const [activeTasksTab, setActiveTasksTab] = useState<string>('');

  // Initialize active tasks tab when plan projects are available
  useEffect(() => {
    if (planProjects.length > 0 && !activeTasksTab) {
      setActiveTasksTab(planProjects[0]);
    }
  }, [planProjects, activeTasksTab]);

  // Get tasks for active tab
  const activeProjectTasks = useMemo(() => {
    if (!session?.plan?.tasks || !activeTasksTab) return [];
    return session.plan.tasks
      .map((task, idx) => ({ task, idx }))
      .filter(({ task }) => task.project === activeTasksTab);
  }, [session?.plan?.tasks, activeTasksTab]);

  // Get tests for active tab
  const activeProjectTests = useMemo(() => {
    if (!session?.plan?.testPlan || !activeTasksTab) return [];
    return session.plan.testPlan[activeTasksTab] || [];
  }, [session?.plan?.testPlan, activeTasksTab]);

  // Convert test states to the format expected by TestList
  const testStatesMap = useMemo(() => {
    if (!session?.testStates) return {};
    return Object.fromEntries(
      Object.entries(session.testStates).map(([project, state]) => [
        project,
        {
          scenarios: state.scenarios,
          updatedAt: state.updatedAt,
        },
      ])
    );
  }, [session?.testStates]);

  // Task status badge
  const getTaskStatusBadge = (project: string) => {
    const projectTasks = session?.taskStates?.filter(t => t.project === project) || [];
    if (projectTasks.length === 0) return null;

    const completedCount = projectTasks.filter(t => t.status === 'completed').length;
    const failedCount = projectTasks.filter(t => t.status === 'failed').length;

    if (failedCount > 0) return <Badge size="xs" color="red" variant="filled">{failedCount} failed</Badge>;
    if (completedCount === projectTasks.length) return <Badge size="xs" color="green" variant="filled">complete</Badge>;
    return <Badge size="xs" color="gray" variant="light">{completedCount}/{projectTasks.length}</Badge>;
  };

  if (loading) {
    return (
      <Container size="lg" pt={100}>
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text c="dimmed">Loading session...</Text>
        </Stack>
      </Container>
    );
  }

  if (error || !session) {
    return (
      <Container size="lg" pt={100}>
        <Stack align="center" gap="md">
          <Text c="red">{error || 'Session not found'}</Text>
          <Button variant="subtle" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </Stack>
      </Container>
    );
  }

  const completionReason = getCompletionReason(session);
  const completionBadge = getCompletionBadge(completionReason);
  const featureTitle = session.plan?.feature || session.feature.replace(/^## Workspace Context\n[\s\S]*?\n\n## Feature\n/, '');

  return (
    <Box style={{ minHeight: '100vh' }}>
      <BackButton to={-1} />
      <Container size="xl" py="xl" pt={60}>
        <Stack gap="lg">
          {/* Header */}
          <Group justify="space-between" align="flex-start">
            <Stack gap="xs" style={{ flex: 1 }}>
              <Title order={2} style={{ fontWeight: 700 }}>
                {featureTitle}
              </Title>
              <Group gap="sm">
                <Badge
                  size="lg"
                  variant="light"
                  color={completionBadge.color}
                  leftSection={completionBadge.icon}
                >
                  {completionBadge.label}
                </Badge>
                <Text size="sm" c="dimmed">
                  {new Date(session.startedAt).toLocaleDateString()} at {new Date(session.startedAt).toLocaleTimeString()}
                </Text>
                {session.completedAt && (
                  <Text size="sm" c="dimmed">
                    - {new Date(session.completedAt).toLocaleTimeString()}
                  </Text>
                )}
              </Group>
            </Stack>
          </Group>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="overview">Overview</Tabs.Tab>
              {session.planningState && <Tabs.Tab value="planning">Planning</Tabs.Tab>}
              <Tabs.Tab value="tasks">Tasks</Tabs.Tab>
              <Tabs.Tab value="chat">Chat History</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="overview" pt="lg">
              <Stack gap="lg">
                {/* Plan Overview */}
                {session.plan && (
                  <GlassCard p="lg">
                    <Stack gap="md">
                      {/* Overview Section */}
                      <Box>
                        <UnstyledButton onClick={() => setShowOverview(!showOverview)}>
                          <Group gap={4}>
                            <ThemeIcon size="xs" variant="transparent" color="gray">
                              {showOverview ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                            </ThemeIcon>
                            <Text size="sm" fw={600} c="dimmed" tt="uppercase">
                              Plan Overview
                            </Text>
                          </Group>
                        </UnstyledButton>
                        <Collapse in={showOverview}>
                          <Box mt="sm">
                            {session.plan.overview && (
                              <Text size="sm" c="dimmed">
                                {session.plan.overview}
                              </Text>
                            )}
                            {session.plan.description && !session.plan.overview && (
                              <MarkdownMessage content={session.plan.description} />
                            )}
                          </Box>
                        </Collapse>
                      </Box>

                      {/* Architecture Section - hidden when diagram fails */}
                      {session.plan.architecture && architectureValid && (
                        <Box>
                          <UnstyledButton onClick={() => setShowArchitecture(!showArchitecture)}>
                            <Group gap={4}>
                              <ThemeIcon size="xs" variant="transparent" color="gray">
                                {showArchitecture ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                              </ThemeIcon>
                              <Text size="sm" fw={600} c="dimmed" tt="uppercase">
                                Architecture
                              </Text>
                            </Group>
                          </UnstyledButton>
                          <Collapse in={showArchitecture}>
                            <Box
                              mt="sm"
                              p="md"
                              style={{
                                backgroundColor: 'rgba(160, 130, 110, 0.04)',
                                borderRadius: 8,
                                border: '1px solid var(--border-subtle)',
                              }}
                            >
                              {session.plan.architecture.includes('```') ? (
                                <MarkdownMessage content={session.plan.architecture} />
                              ) : (
                                <MermaidDiagram
                                  chart={session.plan.architecture}
                                  onRenderError={() => setArchitectureValid(false)}
                                />
                              )}
                            </Box>
                          </Collapse>
                        </Box>
                      )}
                    </Stack>
                  </GlassCard>
                )}

                {/* Summary Stats */}
                <Group gap="md">
                  {session.taskStates && session.taskStates.length > 0 && (
                    <GlassCard p="md" style={{ flex: 1 }}>
                      <Stack gap="xs">
                        <Text size="xs" fw={600} c="dimmed" tt="uppercase">Tasks</Text>
                        <Group gap="md">
                          <Group gap={4}>
                            <ThemeIcon size="sm" color="green" variant="light">
                              <IconCheck size={12} />
                            </ThemeIcon>
                            <Text size="sm">{session.taskStates.filter(t => t.status === 'completed').length} completed</Text>
                          </Group>
                          {session.taskStates.filter(t => t.status === 'failed').length > 0 && (
                            <Group gap={4}>
                              <ThemeIcon size="sm" color="red" variant="light">
                                <IconX size={12} />
                              </ThemeIcon>
                              <Text size="sm">{session.taskStates.filter(t => t.status === 'failed').length} failed</Text>
                            </Group>
                          )}
                        </Group>
                      </Stack>
                    </GlassCard>
                  )}

                  {Object.keys(session.testStates || {}).length > 0 && (
                    <GlassCard p="md" style={{ flex: 1 }}>
                      <Stack gap="xs">
                        <Text size="xs" fw={600} c="dimmed" tt="uppercase">Tests</Text>
                        <Group gap="md">
                          {(() => {
                            let passed = 0, failed = 0;
                            Object.values(session.testStates || {}).forEach(ts => {
                              ts.scenarios.forEach(s => {
                                if (s.status === 'passed') passed++;
                                if (s.status === 'failed') failed++;
                              });
                            });
                            return (
                              <>
                                <Group gap={4}>
                                  <ThemeIcon size="sm" color="green" variant="light">
                                    <IconCheck size={12} />
                                  </ThemeIcon>
                                  <Text size="sm">{passed} passed</Text>
                                </Group>
                                {failed > 0 && (
                                  <Group gap={4}>
                                    <ThemeIcon size="sm" color="red" variant="light">
                                      <IconX size={12} />
                                    </ThemeIcon>
                                    <Text size="sm">{failed} failed</Text>
                                  </Group>
                                )}
                              </>
                            );
                          })()}
                        </Group>
                      </Stack>
                    </GlassCard>
                  )}
                </Group>
              </Stack>
            </Tabs.Panel>

            {/* Planning Tab - shows multi-stage planning workflow data */}
            {session.planningState && (
              <Tabs.Panel value="planning" pt="lg">
                <Stack gap="lg">
                  {/* Stage 1: Refined Feature */}
                  {session.planningState.refinedFeature && (
                    <GlassCard p="lg">
                      <Stack gap="md">
                        <Group gap="xs">
                          <ThemeIcon size="sm" color="blue" variant="light">
                            <IconBulb size={14} />
                          </ThemeIcon>
                          <Text size="sm" fw={600} tt="uppercase" c="dimmed">
                            Feature Requirements
                          </Text>
                          <Badge size="xs" color="green" variant="light">Stage 1</Badge>
                        </Group>
                        <Text size="sm">{session.planningState.refinedFeature.description}</Text>
                        {session.planningState.refinedFeature.requirements.length > 0 && (
                          <Box>
                            <Text size="xs" fw={600} c="dimmed" mb="xs">Key Requirements:</Text>
                            <Stack gap={4}>
                              {session.planningState.refinedFeature.requirements.map((req, idx) => (
                                <Group key={idx} gap="xs" wrap="nowrap">
                                  <ThemeIcon size="xs" color="green" variant="light">
                                    <IconCheck size={10} />
                                  </ThemeIcon>
                                  <Text size="sm">{req}</Text>
                                </Group>
                              ))}
                            </Stack>
                          </Box>
                        )}
                      </Stack>
                    </GlassCard>
                  )}

                  {/* Stage 2: Technical Spec (Exploration & Planning) */}
                  {session.planningState.technicalSpec && (
                    <GlassCard p="lg">
                      <Stack gap="md">
                        <Group gap="xs">
                          <ThemeIcon size="sm" color="teal" variant="light">
                            <IconApi size={14} />
                          </ThemeIcon>
                          <Text size="sm" fw={600} tt="uppercase" c="dimmed">
                            Technical Specification
                          </Text>
                          <Badge size="xs" color="green" variant="light">Stage 2</Badge>
                        </Group>

                        {/* API Contracts */}
                        {session.planningState.technicalSpec.apiContracts.length > 0 && (
                          <Box>
                            <Text size="xs" fw={600} c="dimmed" mb="xs">API Contracts:</Text>
                            <Stack gap="xs">
                              {session.planningState.technicalSpec.apiContracts.map((contract, idx) => (
                                <Box
                                  key={idx}
                                  p="sm"
                                  style={{
                                    backgroundColor: 'rgba(160, 130, 110, 0.04)',
                                    borderRadius: 6,
                                    border: '1px solid var(--border-subtle)',
                                  }}
                                >
                                  <Group gap="xs" mb="xs">
                                    <Badge size="xs" color="blue" variant="filled">{contract.method}</Badge>
                                    <Text size="sm" fw={500} style={{ fontFamily: 'monospace' }}>{contract.endpoint}</Text>
                                  </Group>
                                  <Group gap="lg">
                                    <Text size="xs" c="dimmed">Provided by: <strong>{contract.providedBy}</strong></Text>
                                    {contract.consumedBy.length > 0 && (
                                      <Text size="xs" c="dimmed">Consumed by: <strong>{contract.consumedBy.join(', ')}</strong></Text>
                                    )}
                                  </Group>
                                </Box>
                              ))}
                            </Stack>
                          </Box>
                        )}

                        {/* Architecture Decisions */}
                        {session.planningState.technicalSpec.architectureDecisions.length > 0 && (
                          <Box>
                            <Text size="xs" fw={600} c="dimmed" mb="xs">Architecture Decisions:</Text>
                            <Stack gap={4}>
                              {session.planningState.technicalSpec.architectureDecisions.map((decision, idx) => (
                                <Group key={idx} gap="xs" wrap="nowrap">
                                  <ThemeIcon size="xs" color="teal" variant="light">
                                    <IconCheck size={10} />
                                  </ThemeIcon>
                                  <Text size="sm">{decision}</Text>
                                </Group>
                              ))}
                            </Stack>
                          </Box>
                        )}

                        {/* Execution Order */}
                        {session.planningState.technicalSpec.executionOrder.length > 0 && (
                          <Box>
                            <Text size="xs" fw={600} c="dimmed" mb="xs">Execution Order:</Text>
                            <Stack gap={4}>
                              {session.planningState.technicalSpec.executionOrder.map((item, idx) => (
                                <Group key={idx} gap="xs" wrap="nowrap">
                                  <Badge size="xs" variant="light" color="gray">{idx + 1}</Badge>
                                  <Text size="sm" fw={500}>{item.project}</Text>
                                  {item.dependsOn.length > 0 && (
                                    <Text size="xs" c="dimmed">(depends on: {item.dependsOn.join(', ')})</Text>
                                  )}
                                </Group>
                              ))}
                            </Stack>
                          </Box>
                        )}
                      </Stack>
                    </GlassCard>
                  )}

                  {/* Empty state */}
                  {!session.planningState.refinedFeature &&
                   !session.planningState.technicalSpec && (
                    <GlassCard p="lg">
                      <Text c="dimmed" ta="center">Planning workflow was started but no data was captured.</Text>
                    </GlassCard>
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            <Tabs.Panel value="tasks" pt="lg">
              {planProjects.length > 0 ? (
                <TabbedCard
                  tabs={planProjects.map(project => ({
                    value: project,
                    label: (
                      <Group gap="xs">
                        <span>{project}</span>
                        {getTaskStatusBadge(project)}
                      </Group>
                    ),
                  }))}
                  activeTab={activeTasksTab}
                  onTabChange={setActiveTasksTab}
                >
                  <Stack gap="md">
                    {activeProjectTasks.length > 0 && (
                      <TaskList
                        tasks={activeProjectTasks}
                        taskStates={session.taskStates || []}
                        isApproval={false}
                      />
                    )}

                    {activeProjectTests.length > 0 && (
                      <TestList
                        project={activeTasksTab}
                        scenarios={activeProjectTests}
                        taskStates={session.taskStates || []}
                        testStates={testStatesMap}
                        isApproval={false}
                      />
                    )}
                  </Stack>
                </TabbedCard>
              ) : (
                <GlassCard p="lg">
                  <Text c="dimmed" ta="center">No tasks found in this session</Text>
                </GlassCard>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="chat" pt="lg">
              <GlassCard p={0} style={{ height: 'calc(100vh - 300px)', overflow: 'hidden' }}>
                {chatMessages.length > 0 || flows.length > 0 ? (
                  <ChatTimeline
                    data={chatTimelineData}
                    showInput={false}  // Read-only view - no input
                  />
                ) : (
                  <Stack align="center" justify="center" h="100%">
                    <Text c="dimmed" ta="center" py="xl">No chat history available</Text>
                  </Stack>
                )}
              </GlassCard>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Container>
    </Box>
  );
}
