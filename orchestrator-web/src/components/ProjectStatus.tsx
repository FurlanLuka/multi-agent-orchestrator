import { Card, Text, Badge, Group, Stack, Progress, SimpleGrid } from '@mantine/core';
import {
  IconCircleCheck,
  IconLoader,
  IconAlertTriangle,
  IconBug,
  IconTestPipe,
  IconClock,
  IconLock,
} from '@tabler/icons-react';
import type { ProjectState, AgentStatus } from '@aio/types';

interface ProjectStatusProps {
  statuses: Record<string, ProjectState>;
}

const statusConfig: Record<AgentStatus, { color: string; icon: React.ReactNode; label: string }> = {
  PENDING: { color: 'gray', icon: <IconClock size={16} />, label: 'Pending' },
  IDLE: { color: 'teal', icon: <IconCircleCheck size={16} />, label: 'Complete' },
  WORKING: { color: 'blue', icon: <IconLoader size={16} />, label: 'Working' },
  DEBUGGING: { color: 'yellow', icon: <IconBug size={16} />, label: 'Debugging' },
  FATAL_DEBUGGING: { color: 'red', icon: <IconAlertTriangle size={16} />, label: 'Fatal Debug' },
  READY: { color: 'green', icon: <IconCircleCheck size={16} />, label: 'Ready' },
  E2E: { color: 'violet', icon: <IconTestPipe size={16} />, label: 'E2E Testing' },
  E2E_FIXING: { color: 'orange', icon: <IconBug size={16} />, label: 'Fixing E2E' },
  BLOCKED: { color: 'pink', icon: <IconLock size={16} />, label: 'Blocked' },
  FAILED: { color: 'red', icon: <IconAlertTriangle size={16} />, label: 'Failed' },
};

function getStatusProgress(status: AgentStatus): number {
  switch (status) {
    case 'PENDING':
      return 0;
    case 'IDLE':
      return 100;
    case 'WORKING':
      return 40;
    case 'DEBUGGING':
    case 'FATAL_DEBUGGING':
      return 30;
    case 'READY':
      return 80;
    case 'E2E':
      return 90;
    case 'E2E_FIXING':
      return 85;
    case 'BLOCKED':
      return 20;
    case 'FAILED':
      return 50;
    default:
      return 0;
  }
}

function ProjectCard({ project, state }: { project: string; state: ProjectState }) {
  const config = statusConfig[state.status] || statusConfig.IDLE;
  const timeSince = Math.round((Date.now() - state.updatedAt) / 1000);

  return (
    <Card shadow="sm" p="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} tt="capitalize">{project}</Text>
          <Badge
            leftSection={config.icon}
            color={config.color}
            variant="light"
          >
            {config.label}
          </Badge>
        </Group>

        <Progress
          value={getStatusProgress(state.status)}
          color={config.color}
          size="sm"
          animated={state.status === 'WORKING' || state.status === 'E2E'}
        />

        <Text size="sm" c="dimmed" lineClamp={2}>
          {state.message}
        </Text>

        <Text size="xs" c="dimmed">
          Updated {timeSince}s ago
        </Text>
      </Stack>
    </Card>
  );
}

export function ProjectStatus({ statuses }: ProjectStatusProps) {
  const projects = Object.entries(statuses);

  if (projects.length === 0) {
    return (
      <Card shadow="sm" p="xl" withBorder>
        <Text c="dimmed" ta="center">
          No projects being monitored. Start a session to begin.
        </Text>
      </Card>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
      {projects.map(([project, state]) => (
        <ProjectCard key={project} project={project} state={state} />
      ))}
    </SimpleGrid>
  );
}
