import { useState, useMemo, useCallback } from 'react';
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
  Badge,
} from '@mantine/core';
import {
  IconMessageCircle,
  IconClipboardList,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react';
import { useOrchestrator } from '../../context/OrchestratorContext';
import { AssistantChat } from '../AssistantChat';
import { ApprovalPanel } from '../ApprovalPanel';
import { ProjectCard } from '../ProjectCard';
import { TabbedPlanView } from '../TabbedPlanView';
import { MarkdownMessage } from '../MarkdownMessage';
import { UserInputOverlay } from '../UserInputOverlay';
import { AppHeader } from '../layout/AppHeader';
import { CompletionPanel } from './CompletionPanel';

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
    currentApproval,
    allComplete,
    activeSessionId,
    respondToApproval,
    submitUserInput,
    userInputRequest,
    permissionPrompt,
    respondToPermission,
    retryProject,
  } = useOrchestrator();

  const sessionProjects = session?.projects || Object.keys(statuses);
  const [showPlan, setShowPlan] = useState(true);
  const [showInitialPrompt, setShowInitialPrompt] = useState(false);

  // Shutdown on close preference (persisted to localStorage)
  const [shutdownOnClose, setShutdownOnClose] = useState(() => {
    return localStorage.getItem('aio-shutdown-on-close') === 'true';
  });

  const handleShutdownOnCloseChange = useCallback((checked: boolean) => {
    setShutdownOnClose(checked);
    localStorage.setItem('aio-shutdown-on-close', String(checked));
  }, []);

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

  const handleRetryProject = useCallback((project: string) => {
    retryProject(project);
  }, [retryProject]);

  return (
    <AppShell
      header={{ height: 64 }}
      padding="md"
      styles={{
        root: { minHeight: '100%' },
        main: { minHeight: 'calc(100vh - 64px)' },
      }}
    >
      <AppShell.Header
        p="md"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <AppHeader
          activeSessionId={activeSessionId}
          shutdownOnClose={shutdownOnClose}
          onShutdownOnCloseChange={handleShutdownOnCloseChange}
          onBackToHome={onBackToHome}
        />
      </AppShell.Header>

      <AppShell.Main>
        <Container size="100%" py="md" h="calc(100vh - 80px)">
          {allComplete && <CompletionPanel onBackToHome={onBackToHome} />}

          {session && (
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
                    border: '1px solid var(--mantine-color-default-border)',
                  }}
                >
                  {/* Chat Header */}
                  <Group justify="space-between" p="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
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
                          border: '1px solid var(--mantine-color-default-border)',
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
                              style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
                            >
                              <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
                                Initial Prompt
                              </Text>
                              <Box
                                p="sm"
                                style={{
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
                              style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
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
