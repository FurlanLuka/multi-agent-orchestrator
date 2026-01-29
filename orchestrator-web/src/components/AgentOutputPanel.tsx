import { useRef, useEffect } from 'react';
import {
  Paper,
  Accordion,
  ScrollArea,
  Text,
  Badge,
  Group,
  Code,
  Stack,
} from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';
import type { LogEntry } from '@orchy/types';

interface AgentOutputPanelProps {
  logs: LogEntry[];
  projects: string[];
}

export function AgentOutputPanel({ logs, projects }: AgentOutputPanelProps) {
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Filter to only agent logs
  const agentLogs = logs.filter(l => l.type === 'agent');

  // Group by project
  const logsByProject = projects.reduce((acc, project) => {
    acc[project] = agentLogs.filter(l => l.project === project);
    return acc;
  }, {} as Record<string, LogEntry[]>);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    Object.values(scrollRefs.current).forEach(ref => {
      if (ref) {
        ref.scrollTo({ top: ref.scrollHeight, behavior: 'smooth' });
      }
    });
  }, [agentLogs.length]);

  // Count total agent logs
  const totalAgentLogs = agentLogs.length;

  if (projects.length === 0) {
    return null;
  }

  return (
    <Paper shadow="sm" p="md" withBorder>
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <IconTerminal2 size={20} />
          <Text fw={600}>Agent Output</Text>
        </Group>
        <Badge variant="light" color="blue">
          {totalAgentLogs} logs
        </Badge>
      </Group>

      {totalAgentLogs === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          No agent output yet. Start execution to see agent logs.
        </Text>
      ) : (
        <Accordion variant="separated" defaultValue={projects[0]}>
          {projects.map(project => {
            const projectLogs = logsByProject[project] || [];
            const recentLogs = projectLogs.slice(-50); // Show last 50 logs

            return (
              <Accordion.Item key={project} value={project}>
                <Accordion.Control>
                  <Group justify="space-between" wrap="nowrap" pr="md">
                    <Text size="sm" fw={500}>{project}</Text>
                    <Badge size="sm" variant="light" color={projectLogs.length > 0 ? 'green' : 'gray'}>
                      {projectLogs.length} lines
                    </Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <ScrollArea
                    h={200}
                    viewportRef={(ref) => { scrollRefs.current[project] = ref; }}
                    style={{ backgroundColor: '#1e1e1e', borderRadius: '4px' }}
                  >
                    <Stack gap={0} p="xs">
                      {recentLogs.length === 0 ? (
                        <Text size="xs" c="dimmed" ta="center" py="md">
                          No output from {project} agent
                        </Text>
                      ) : (
                        recentLogs.map((log, i) => (
                          <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
                            <Text
                              size="xs"
                              c="dimmed"
                              style={{ fontFamily: 'monospace', minWidth: '70px' }}
                            >
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </Text>
                            <Code
                              block
                              style={{
                                backgroundColor: 'transparent',
                                color: log.stream === 'stderr' ? '#ff6b6b' : '#abb2bf',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                padding: 0,
                                flex: 1,
                              }}
                            >
                              {log.text}
                            </Code>
                          </Group>
                        ))
                      )}
                    </Stack>
                  </ScrollArea>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}
    </Paper>
  );
}
