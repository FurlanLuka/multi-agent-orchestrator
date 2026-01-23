import { useState } from 'react';
import {
  Paper,
  TextInput,
  Button,
  Stack,
  Text,
  MultiSelect,
  Group,
  Badge,
  Divider,
  Card,
  ActionIcon,
  Loader,
} from '@mantine/core';
import { IconRocket, IconTrash, IconPlayerPlay, IconCheck, IconAlertTriangle, IconClock } from '@tabler/icons-react';
import type { SessionSummary, SessionStatus } from '../types';

interface SessionSetupProps {
  availableProjects: string[];
  onStartSession: (feature: string, projects: string[]) => void;
  connected: boolean;
  sessions?: SessionSummary[];
  onLoadSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  loadingSession?: boolean;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return `Today, ${timeStr}`;
  } else if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
  }
}

function getStatusBadge(status: SessionStatus) {
  switch (status) {
    case 'completed':
      return <Badge color="green" leftSection={<IconCheck size={12} />}>Complete</Badge>;
    case 'running':
      return <Badge color="blue" leftSection={<IconPlayerPlay size={12} />}>Running</Badge>;
    case 'interrupted':
      return <Badge color="orange" leftSection={<IconAlertTriangle size={12} />}>Interrupted</Badge>;
    case 'planning':
      return <Badge color="gray" leftSection={<IconClock size={12} />}>Planning</Badge>;
    default:
      return <Badge color="gray">{status}</Badge>;
  }
}

export function SessionSetup({
  availableProjects,
  onStartSession,
  connected,
  sessions = [],
  onLoadSession,
  onDeleteSession,
  loadingSession = false,
}: SessionSetupProps) {
  const [feature, setFeature] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  const handleStart = () => {
    if (feature.trim() && selectedProjects.length > 0) {
      onStartSession(feature.trim(), selectedProjects);
    }
  };

  const projectOptions = availableProjects.map(p => ({ value: p, label: p }));

  return (
    <Stack gap="lg">
      {/* Previous Sessions */}
      {sessions.length > 0 && (
        <Paper shadow="sm" p="xl" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600} size="xl">Previous Sessions</Text>
              <Badge color={connected ? 'green' : 'red'}>
                {connected ? 'Connected' : 'Disconnected'}
              </Badge>
            </Group>

            <Text c="dimmed" size="sm">
              Load a previous session to view history or continue working.
            </Text>

            <Stack gap="xs">
              {sessions.map((session) => (
                <Card key={session.id} padding="sm" withBorder>
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs">
                        <Text fw={500} truncate style={{ maxWidth: '300px' }}>
                          {session.feature}
                        </Text>
                        {getStatusBadge(session.status)}
                      </Group>
                      <Group gap="xs">
                        <Text size="xs" c="dimmed">
                          {session.projects.join(', ')}
                        </Text>
                        <Text size="xs" c="dimmed">
                          •
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatDate(session.startedAt)}
                        </Text>
                      </Group>
                    </Stack>

                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => onLoadSession?.(session.id)}
                        disabled={!connected || loadingSession}
                        leftSection={loadingSession ? <Loader size={12} /> : <IconPlayerPlay size={14} />}
                      >
                        {loadingSession ? 'Loading...' : 'Load'}
                      </Button>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        onClick={() => onDeleteSession?.(session.id)}
                        disabled={!connected}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Card>
              ))}
            </Stack>
          </Stack>
        </Paper>
      )}

      {sessions.length > 0 && (
        <Divider label="OR" labelPosition="center" />
      )}

      {/* New Session Form */}
      <Paper shadow="sm" p="xl" withBorder>
        <Stack gap="lg">
          <Group justify="space-between">
            <Text fw={600} size="xl">Start New Session</Text>
            {sessions.length === 0 && (
              <Badge color={connected ? 'green' : 'red'}>
                {connected ? 'Connected' : 'Disconnected'}
              </Badge>
            )}
          </Group>

          <Text c="dimmed">
            Describe the feature you want to build, and select which projects are involved.
            The Planning Agent will create an implementation plan for review.
          </Text>

          <TextInput
            label="Feature Description"
            placeholder="e.g., Add user authentication with Google OAuth"
            value={feature}
            onChange={(e) => setFeature(e.target.value)}
            size="md"
          />

          <MultiSelect
            label="Projects"
            placeholder="Select projects to include"
            data={projectOptions}
            value={selectedProjects}
            onChange={setSelectedProjects}
            searchable
            size="md"
          />

          <Button
            leftSection={<IconRocket size={18} />}
            size="md"
            onClick={handleStart}
            disabled={!connected || !feature.trim() || selectedProjects.length === 0}
          >
            Start Planning
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
