import { useState, useMemo, useCallback } from 'react';
import {
  Container,
  Stack,
  Group,
  Text,
  Grid,
  Box,
  ThemeIcon,
  ScrollArea,
  Button,
  Collapse,
  Badge,
  Title,
  Modal,
  UnstyledButton,
} from '@mantine/core';
import {
  IconChevronDown,
  IconPlayerStop,
  IconChevronRight,
} from '@tabler/icons-react';
import { useOrchestrator } from '../../context/OrchestratorContext';
import { AssistantChat } from '../AssistantChat';
import { ProjectTabContent } from '../ProjectTabContent';
import { MarkdownMessage } from '../MarkdownMessage';
import { MermaidDiagram } from '../MermaidDiagram';
import { UserInputOverlay } from '../UserInputOverlay';
import { CompletionPanel } from './CompletionPanel';
import { TaskList } from '../plan/TaskList';
import { TestList } from '../plan/TestList';
import { NotificationSettingsPopover } from '../settings/NotificationSettingsPopover';
import { useNotifications } from '../../hooks/useNotifications';
import { glass, radii, TabbedCard } from '../../theme';

interface SessionViewProps {
  onBackToHome: () => void;
}

export function SessionView({ onBackToHome }: SessionViewProps) {
  const {
    session,
    statuses,
    logs,
    streamingMessages,
    testStates,
    taskStates,
    allComplete,
    submitUserInput,
    userInputRequest,
    permissionPrompt,
    respondToPermission,
    retryProject,
    startNewSession,
  } = useOrchestrator();

  // Activate notification system
  useNotifications();

  const sessionProjects = session?.projects || Object.keys(statuses);
  const [showInitialPrompt, setShowInitialPrompt] = useState(false);
  const [showArchitecture, setShowArchitecture] = useState(false);
  const [architectureValid, setArchitectureValid] = useState(true);
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [activeTasksTab, setActiveTasksTab] = useState<string>(sessionProjects[0] || '');
  const [activeTrackingTab, setActiveTrackingTab] = useState<string>(sessionProjects[0] || '');

  // Collapsible sections state
  const [showTasksSection, setShowTasksSection] = useState(true);
  const [showTrackingSection, setShowTrackingSection] = useState(true);

  const isStreaming = useMemo(
    () => streamingMessages.some(m => m.status === 'streaming'),
    [streamingMessages]
  );

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

  // Get unique projects from tasks
  const planProjects = useMemo(() => {
    if (!session?.plan?.tasks) return [];
    return [...new Set(session.plan.tasks.map(t => t.project))];
  }, [session?.plan?.tasks]);

  // Get tasks for active tasks tab
  const activeProjectTasks = useMemo(() => {
    if (!session?.plan?.tasks || !activeTasksTab) return [];
    return session.plan.tasks
      .map((task, idx) => ({ task, idx }))
      .filter(({ task }) => task.project === activeTasksTab);
  }, [session?.plan?.tasks, activeTasksTab]);

  // Get tests for active tasks tab
  const activeProjectTests = useMemo(() => {
    if (!session?.plan?.testPlan || !activeTasksTab) return [];
    return session.plan.testPlan[activeTasksTab] || [];
  }, [session?.plan?.testPlan, activeTasksTab]);

  // Task status badge for Tasks & Tests tabs
  const getTaskStatusBadge = useCallback((project: string) => {
    if (!taskStates) return null;
    const projectTasks = taskStates.filter(t => t.project === project);
    if (projectTasks.length === 0) return null;

    const completedCount = projectTasks.filter(t => t.status === 'completed').length;
    const failedCount = projectTasks.filter(t => t.status === 'failed' || t.status === 'e2e_failed').length;
    const workingCount = projectTasks.filter(t =>
      t.status === 'working' || t.status === 'verifying' || t.status === 'fixing' || t.status === 'e2e'
    ).length;

    if (failedCount > 0) return <Badge size="xs" color="rose" variant="filled">{failedCount} failed</Badge>;
    if (workingCount > 0) return <Badge size="xs" color="peach" variant="light">working...</Badge>;
    if (completedCount === projectTasks.length) return <Badge size="xs" color="sage" variant="filled">complete</Badge>;
    return <Badge size="xs" color="gray" variant="light">{completedCount}/{projectTasks.length}</Badge>;
  }, [taskStates]);

  // Status configuration for tracking badges
  const statusConfig: Record<string, { color: string; label: string }> = {
    PENDING: { color: 'gray', label: 'Pending' },
    IDLE: { color: 'sage', label: 'Complete' },
    WORKING: { color: 'peach', label: 'Working' },
    DEBUGGING: { color: 'honey', label: 'Debugging' },
    FATAL_DEBUGGING: { color: 'rose', label: 'Fatal' },
    READY: { color: 'sage', label: 'Ready' },
    E2E: { color: 'lavender', label: 'E2E' },
    E2E_FIXING: { color: 'lavender', label: 'E2E Fix' },
    BLOCKED: { color: 'honey', label: 'Blocked' },
    FAILED: { color: 'rose', label: 'Failed' },
  };

  // Tracking status badge for Project Tracking tabs
  const getTrackingStatusBadge = useCallback((project: string) => {
    const projectStatus = statuses[project]?.status || 'PENDING';
    const config = statusConfig[projectStatus] || statusConfig.PENDING;
    return <Badge size="xs" color={config.color} variant="filled">{config.label}</Badge>;
  }, [statuses]);

  const handleRetryProject = useCallback((project: string) => {
    retryProject(project);
  }, [retryProject]);

  const handleStopSession = useCallback(() => {
    startNewSession();
    onBackToHome();
    setStopModalOpen(false);
  }, [startNewSession, onBackToHome]);

  return (
    <Box style={{ minHeight: '100vh' }}>
      <Container size="100%" py="md" h="100vh">
        <Stack gap="md" h="100%">
          {/* Simple Header Row */}
          <Group justify="space-between" px="xs">
            <Title order={3} style={{ fontWeight: 700, color: 'var(--text-heading)' }}>
              Orchy
            </Title>
            <Group gap="xs">
              <NotificationSettingsPopover />
              <Button
                variant="subtle"
                color="rose"
                leftSection={<IconPlayerStop size={16} />}
                onClick={() => setStopModalOpen(true)}
              >
                Stop Session
              </Button>
            </Group>
          </Group>

          {allComplete && <CompletionPanel onBackToHome={onBackToHome} />}

          {session && (
            <Grid gutter="lg" style={{ flex: 1, minHeight: 0 }}>
              {/* LEFT PANEL: Planning Chat */}
              <Grid.Col
                span={{ base: 12, lg: session.plan ? 5 : 12 }}
                style={{ minWidth: 380 }}
              >
                <Stack gap="lg" h="calc(100vh - 100px)">
                  <Box
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: radii.surface,
                      background: glass.formCard.bg,
                      border: glass.formCard.border,
                      boxShadow: glass.formCard.shadow,
                    }}
                  >
                    {/* Chat Header */}
                    <Group
                      justify="space-between"
                      px="lg"
                      py="md"
                      style={{
                        background: glass.modalZone.bg,
                        borderBottom: glass.modalZone.border,
                        flexShrink: 0,
                      }}
                    >
                      <Text fw={600} size="sm" style={{ color: 'var(--text-heading)' }}>
                        Planning Agent
                      </Text>
                      <Badge
                        color={isStreaming ? 'peach' : 'gray'}
                        variant="light"
                        size="sm"
                        radius="md"
                      >
                        {isStreaming ? 'Thinking...' : 'Ready'}
                      </Badge>
                    </Group>
                    <Box style={{ flex: 1, minHeight: 0 }}>
                      <AssistantChat />
                    </Box>
                  </Box>
                </Stack>
              </Grid.Col>

              {/* RIGHT PANEL: Status + Outputs */}
              {session.plan && (
                <Grid.Col span={{ base: 12, lg: 7 }}>
                  <ScrollArea h="calc(100vh - 100px)" type="auto" offsetScrollbars>
                    <Stack gap="lg">
                      {/* Feature Card - FormCard style */}
                      <Box
                        style={{
                          borderRadius: radii.surface,
                          background: glass.formCard.bg,
                          border: glass.formCard.border,
                          boxShadow: glass.formCard.shadow,
                          overflow: 'hidden',
                        }}
                      >
                        {/* Header with feature title */}
                        <Box
                          px="lg"
                          py="md"
                          style={{
                            background: glass.modalZone.bg,
                            borderBottom: glass.modalZone.border,
                          }}
                        >
                          <Group justify="space-between" align="center">
                            <Text fw={600} size="sm" style={{ color: 'var(--text-heading)' }}>
                              {session.plan?.feature || session.feature}
                            </Text>
                            <Badge variant="light" color="gray" size="sm" radius="md">
                              {new Date(session.startedAt).toLocaleTimeString()}
                            </Badge>
                          </Group>
                        </Box>

                        {/* Content */}
                        <Box p="lg">
                          <Stack gap="md">
                            {/* Initial Prompt - collapsible */}
                            <Box>
                              <UnstyledButton
                                onClick={() => setShowInitialPrompt(!showInitialPrompt)}
                                style={{ display: 'inline-flex' }}
                              >
                                <Group gap={4}>
                                  <ThemeIcon size="xs" variant="transparent" color="gray">
                                    {showInitialPrompt ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                                  </ThemeIcon>
                                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                                    Initial Prompt
                                  </Text>
                                </Group>
                              </UnstyledButton>
                              <Collapse in={showInitialPrompt}>
                                <Box
                                  mt="xs"
                                  p="sm"
                                  style={{
                                    backgroundColor: 'rgba(160, 130, 110, 0.04)',
                                    borderRadius: 8,
                                    border: '1px solid var(--border-subtle)',
                                  }}
                                >
                                  <MarkdownMessage content={session.feature} />
                                </Box>
                              </Collapse>
                            </Box>

                            {/* Overview */}
                            {session.plan.overview && (
                              <Text size="sm" c="dimmed">
                                {session.plan.overview}
                              </Text>
                            )}

                            {/* Architecture - collapsible, hidden when diagram fails */}
                            {session.plan.architecture && architectureValid && (
                              <Box>
                                <UnstyledButton
                                  onClick={() => setShowArchitecture(!showArchitecture)}
                                  style={{ display: 'inline-flex' }}
                                >
                                  <Group gap={4}>
                                    <ThemeIcon size="xs" variant="transparent" color="gray">
                                      {showArchitecture ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                                    </ThemeIcon>
                                    <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                                      Architecture
                                    </Text>
                                  </Group>
                                </UnstyledButton>
                                <Collapse in={showArchitecture}>
                                  <Box
                                    mt="xs"
                                    p="sm"
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
                        </Box>
                      </Box>

                      {/* Section Title - Collapsible */}
                      <UnstyledButton onClick={() => setShowTasksSection(!showTasksSection)}>
                        <Group gap={4}>
                          <ThemeIcon size="xs" variant="transparent" color="gray">
                            {showTasksSection ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                          </ThemeIcon>
                          <Text size="sm" fw={600} c="dimmed" tt="uppercase">
                            Tasks & Tests
                          </Text>
                        </Group>
                      </UnstyledButton>

                      {/* Tabbed Tasks & Tests Card */}
                      <Collapse in={showTasksSection}>
                      {planProjects.length > 0 && (
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
                            {/* Tasks */}
                            {activeProjectTasks.length > 0 && (
                              <TaskList
                                tasks={activeProjectTasks}
                                taskStates={taskStates}
                                isApproval={false}
                              />
                            )}

                            {/* Tests */}
                            {activeProjectTests.length > 0 && (
                              <TestList
                                project={activeTasksTab}
                                scenarios={activeProjectTests}
                                taskStates={taskStates}
                                testStates={testStates}
                                isApproval={false}
                              />
                            )}
                          </Stack>
                        </TabbedCard>
                      )}
                      </Collapse>

                      {/* Section Title - Collapsible */}
                      <UnstyledButton onClick={() => setShowTrackingSection(!showTrackingSection)}>
                        <Group gap={4}>
                          <ThemeIcon size="xs" variant="transparent" color="gray">
                            {showTrackingSection ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                          </ThemeIcon>
                          <Text size="sm" fw={600} c="dimmed" tt="uppercase">
                            Project Tracking
                          </Text>
                        </Group>
                      </UnstyledButton>

                      {/* Tabbed Project Tracking Card */}
                      <Collapse in={showTrackingSection}>
                      {sessionProjects.length > 0 && (
                        <TabbedCard
                          tabs={sessionProjects.map(project => ({
                            value: project,
                            label: (
                              <Group gap="xs">
                                <span>{project}</span>
                                {getTrackingStatusBadge(project)}
                              </Group>
                            ),
                          }))}
                          activeTab={activeTrackingTab}
                          onTabChange={setActiveTrackingTab}
                        >
                          {(() => {
                            const projectStatus = statuses[activeTrackingTab]?.status || 'PENDING';
                            return (
                              <ProjectTabContent
                                project={activeTrackingTab}
                                status={projectStatus}
                                message={statuses[activeTrackingTab]?.message || ''}
                                updatedAt={statuses[activeTrackingTab]?.updatedAt || 0}
                                logs={logsByProject[activeTrackingTab] || []}
                                testState={testStates[activeTrackingTab]}
                                permissionPrompt={permissionPrompt?.project === activeTrackingTab ? {
                                  toolName: permissionPrompt.toolName,
                                  toolInput: permissionPrompt.toolInput
                                } : null}
                                onPermissionResponse={respondToPermission}
                                onRetry={
                                  (projectStatus === 'FATAL_DEBUGGING' || projectStatus === 'FAILED')
                                    ? () => handleRetryProject(activeTrackingTab)
                                    : undefined
                                }
                              />
                            );
                          })()}
                        </TabbedCard>
                      )}
                      </Collapse>
                    </Stack>
                  </ScrollArea>
                </Grid.Col>
              )}
            </Grid>
          )}
        </Stack>
      </Container>

      {/* Stop Session Confirmation Modal */}
      <Modal
        opened={stopModalOpen}
        onClose={() => setStopModalOpen(false)}
        title="Stop Session"
        centered
        radius="lg"
        styles={{
          content: {
            background: 'rgba(255, 255, 255, 0.98)',
            backdropFilter: 'blur(24px)',
          },
        }}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Are you sure you want to stop the current session? This will end all running tasks and return you to the home screen.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" color="gray" onClick={() => setStopModalOpen(false)}>
              Cancel
            </Button>
            <Button color="rose" leftSection={<IconPlayerStop size={16} />} onClick={handleStopSession}>
              Stop Session
            </Button>
          </Group>
        </Stack>
      </Modal>

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
    </Box>
  );
}
