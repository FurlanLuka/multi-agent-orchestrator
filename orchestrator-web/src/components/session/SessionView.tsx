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
} from '@mantine/core';
import {
  IconMessageCircle,
  IconClipboardList,
  IconChevronDown,
  IconChevronUp,
  IconPlayerStop,
  IconRocket,
} from '@tabler/icons-react';
import { useOrchestrator } from '../../context/OrchestratorContext';
import { AssistantChat } from '../AssistantChat';
import { ApprovalPanel } from '../ApprovalPanel';
import { ProjectCard } from '../ProjectCard';
import { TabbedPlanView } from '../TabbedPlanView';
import { MarkdownMessage } from '../MarkdownMessage';
import { UserInputOverlay } from '../UserInputOverlay';
import { CompletionPanel } from './CompletionPanel';
import { GlassCard } from '../../theme';

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
    respondToApproval,
    submitUserInput,
    userInputRequest,
    permissionPrompt,
    respondToPermission,
    retryProject,
    startNewSession,
  } = useOrchestrator();

  const sessionProjects = session?.projects || Object.keys(statuses);
  const [showPlan, setShowPlan] = useState(true);
  const [showInitialPrompt, setShowInitialPrompt] = useState(false);
  const [stopModalOpen, setStopModalOpen] = useState(false);

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
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" color="peach" variant="light">
                <IconRocket size={20} />
              </ThemeIcon>
              <Title order={3} style={{ fontWeight: 700, color: 'var(--text-heading)' }}>
                Orchy
              </Title>
            </Group>
            <Button
              variant="subtle"
              color="rose"
              leftSection={<IconPlayerStop size={16} />}
              onClick={() => setStopModalOpen(true)}
            >
              Stop Session
            </Button>
          </Group>

          {allComplete && <CompletionPanel onBackToHome={onBackToHome} />}

          {session && (
            <Grid gutter="lg" style={{ flex: 1, minHeight: 0 }}>
              {/* LEFT PANEL: Planning Chat */}
              <Grid.Col
                span={{ base: 12, lg: session.plan ? 5 : 12 }}
                style={{ minWidth: 380 }}
              >
                <GlassCard
                  p={0}
                  h="calc(100vh - 100px)"
                  style={{ overflow: 'hidden' }}
                >
                  {/* Chat Header */}
                  <Group
                    justify="space-between"
                    p="md"
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: 'rgba(160, 130, 110, 0.03)',
                    }}
                  >
                    <Group gap="xs">
                      <ThemeIcon size="sm" radius="md" variant="light" color="peach">
                        <IconMessageCircle size={14} />
                      </ThemeIcon>
                      <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                        Planning Agent
                      </Text>
                    </Group>
                    <Badge
                      color={isStreaming ? 'peach' : 'gray'}
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
                </GlassCard>
              </Grid.Col>

              {/* RIGHT PANEL: Status + Outputs */}
              {session.plan && (
                <Grid.Col span={{ base: 12, lg: 7 }}>
                  <ScrollArea h="calc(100vh - 100px)" type="auto" offsetScrollbars>
                    <Stack gap="md">
                      {/* Feature Header Card */}
                      <GlassCard p="lg">
                        <Stack gap="xs">
                          <Group gap="xs">
                            <ThemeIcon size="sm" radius="md" variant="light" color="lavender">
                              <IconClipboardList size={14} />
                            </ThemeIcon>
                            <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                              Current Feature
                            </Text>
                          </Group>
                          <Text fw={700} size="lg" style={{ lineHeight: 1.3, color: 'var(--text-heading)' }}>
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
                              style={{ borderTop: '1px solid var(--border-subtle)' }}
                            >
                              <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
                                Initial Prompt
                              </Text>
                              <Box p="sm">
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
                              style={{ borderTop: '1px solid var(--border-subtle)' }}
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
                      </GlassCard>

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
    </Box>
  );
}
