import { MantineProvider, AppShell, Container, Stack, Title, Group, Badge, Text, Alert, Tabs, Grid } from '@mantine/core';
import '@mantine/core/styles.css';
import { IconRocket, IconMessageCircle, IconActivity, IconFileText, IconCheck } from '@tabler/icons-react';
import { useSocket } from './hooks/useSocket';
import { PlanningChat } from './components/PlanningChat';
import { ProjectStatus } from './components/ProjectStatus';
import { LogViewer } from './components/LogViewer';
import { ApprovalPanel } from './components/ApprovalPanel';
import { SessionSetup } from './components/SessionSetup';
import { ProjectManager } from './components/ProjectManager';
import { AgentOutputPanel } from './components/AgentOutputPanel';

function App() {
  const {
    connected,
    session,
    statuses,
    logs,
    chatHistory,
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

  return (
    <MantineProvider defaultColorScheme="light">
      <AppShell
        header={{ height: 60 }}
        padding="md"
      >
        <AppShell.Header p="md">
          <Group justify="space-between">
            <Group>
              <IconRocket size={28} />
              <Title order={3}>Multi-Agent Orchestrator</Title>
            </Group>
            <Group>
              {session && (
                <Badge variant="light" color="blue" size="lg">
                  Session: {session.id}
                </Badge>
              )}
              <Badge
                color={connected ? 'green' : 'red'}
                variant="dot"
                size="lg"
              >
                {connected ? 'Connected' : 'Disconnected'}
              </Badge>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Main>
          <Container size="xl" py="md">
            {/* All Complete Banner */}
            {allComplete && (
              <Alert
                icon={<IconCheck size={20} />}
                title="Feature Complete!"
                color="green"
                mb="md"
              >
                All projects have completed their tasks successfully.
              </Alert>
            )}

            {/* No Session - Show Setup + Project Manager */}
            {!session && (
              <Grid gutter="md">
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

            {/* Active Session */}
            {session && (
              <Tabs defaultValue="status">
                <Tabs.List mb="md">
                  <Tabs.Tab value="status" leftSection={<IconActivity size={16} />}>
                    Status
                  </Tabs.Tab>
                  <Tabs.Tab value="chat" leftSection={<IconMessageCircle size={16} />}>
                    Planning Chat
                  </Tabs.Tab>
                  <Tabs.Tab value="logs" leftSection={<IconFileText size={16} />}>
                    Logs
                  </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="status">
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Text fw={600}>Feature: {session.feature}</Text>
                      <Text size="sm" c="dimmed">
                        Started {new Date(session.startedAt).toLocaleTimeString()}
                      </Text>
                    </Group>
                    <ProjectStatus statuses={statuses} />
                    <AgentOutputPanel logs={logs} projects={sessionProjects} />
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="chat" h="calc(100vh - 200px)">
                  <PlanningChat
                    chatHistory={chatHistory}
                    pendingPlan={pendingPlan}
                    onSendMessage={sendChat}
                    onApprovePlan={approvePlan}
                    sessionActive={!!session}
                  />
                </Tabs.Panel>

                <Tabs.Panel value="logs" h="calc(100vh - 200px)">
                  <LogViewer
                    logs={logs}
                    projects={sessionProjects}
                    onClearLogs={clearLogs}
                  />
                </Tabs.Panel>
              </Tabs>
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
