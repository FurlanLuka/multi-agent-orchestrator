import { useEffect, useState } from 'react';
import {
  Stack,
  Text,
  Group,
  Loader,
  Badge,
  UnstyledButton,
  ThemeIcon,
  Button,
} from '@mantine/core';
import { IconCheck, IconX, IconAlertTriangle, IconMinus, IconHistory, IconPlayerPlay } from '@tabler/icons-react';
import type { SessionHistoryEntry, SessionCompletionReason } from '@orchy/types';
import { GlassCard } from '../../theme';

/**
 * Determines if a session can be resumed
 * Resumable conditions:
 * - Status is 'interrupted'
 * - Completion reason is 'task_errors' or 'test_errors'
 */
function isSessionResumable(session: SessionHistoryEntry): boolean {
  return (
    session.status === 'interrupted' ||
    session.completionReason === 'task_errors' ||
    session.completionReason === 'test_errors'
  );
}

interface SessionHistoryListProps {
  workspaceId: string;
  onSelectSession: (sessionId: string) => void;
  onResumeSession?: (sessionId: string) => void;
  port: number | null;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

function getCompletionBadge(reason: SessionCompletionReason | undefined, status: string) {
  if (status === 'planning' || status === 'running') {
    return { color: 'blue', icon: null, label: status === 'planning' ? 'Planning' : 'Running' };
  }

  switch (reason) {
    case 'all_completed':
      return { color: 'green', icon: <IconCheck size={12} />, label: 'Completed' };
    case 'task_errors':
      return { color: 'red', icon: <IconX size={12} />, label: 'Task errors' };
    case 'test_errors':
      return { color: 'orange', icon: <IconAlertTriangle size={12} />, label: 'Test errors' };
    case 'interrupted':
      return { color: 'gray', icon: <IconMinus size={12} />, label: 'Interrupted' };
    default:
      return { color: 'gray', icon: null, label: 'Unknown' };
  }
}

export function SessionHistoryList({ workspaceId, onSelectSession, onResumeSession, port }: SessionHistoryListProps) {
  const [sessions, setSessions] = useState<SessionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectivePort = port ?? (window as unknown as { __ORCHESTRATOR_PORT__?: number }).__ORCHESTRATOR_PORT__ ?? 3456;

  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`http://localhost:${effectivePort}/api/workspaces/${workspaceId}/sessions`);
        if (!response.ok) {
          throw new Error('Failed to fetch sessions');
        }
        const data = await response.json();
        setSessions(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sessions');
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [workspaceId, effectivePort]);

  if (loading) {
    return (
      <Stack align="center" py="lg">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">Loading session history...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Text c="red" size="sm">{error}</Text>
    );
  }

  if (sessions.length === 0) {
    return null; // Don't show anything if no previous sessions
  }

  return (
    <Stack gap="md">
      <Group gap="xs" align="center">
        <ThemeIcon variant="subtle" size="sm" color="gray">
          <IconHistory size={14} />
        </ThemeIcon>
        <Text size="sm" fw={500} c="dimmed">Previous Sessions</Text>
      </Group>

      <Stack gap="xs">
        {sessions.slice(0, 5).map((session) => {
          const badge = getCompletionBadge(session.completionReason, session.status);
          const resumable = isSessionResumable(session);

          return (
            <GlassCard
              key={session.id}
              hoverable
              p="sm"
              style={{ cursor: 'pointer' }}
            >
              <Group justify="space-between" wrap="nowrap">
                <UnstyledButton
                  onClick={() => onSelectSession(session.id)}
                  style={{ flex: 1, overflow: 'hidden' }}
                >
                  <Stack gap={2}>
                    <Text
                      size="sm"
                      fw={500}
                      lineClamp={1}
                      style={{ textOverflow: 'ellipsis', overflow: 'hidden' }}
                    >
                      {session.feature.replace(/^## Workspace Context\n[\s\S]*?\n\n## Feature\n/, '')}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatRelativeTime(session.completedAt || session.updatedAt)}
                    </Text>
                  </Stack>
                </UnstyledButton>
                <Group gap="xs" wrap="nowrap">
                  {resumable && onResumeSession && (
                    <Button
                      size="xs"
                      variant="light"
                      color="sage"
                      leftSection={<IconPlayerPlay size={12} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onResumeSession(session.id);
                      }}
                    >
                      Resume
                    </Button>
                  )}
                  <Badge
                    size="sm"
                    variant="light"
                    color={badge.color}
                    leftSection={badge.icon}
                  >
                    {badge.label}
                  </Badge>
                </Group>
              </Group>
            </GlassCard>
          );
        })}
      </Stack>
    </Stack>
  );
}
