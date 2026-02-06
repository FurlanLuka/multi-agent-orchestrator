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
import { IconCheck, IconHistory, IconPlayerPlay, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { SessionHistoryEntry } from '@orchy/types';
import { GlassCard, FormCard } from '../../theme';

const PAGE_SIZE = 8;

interface SessionHistoryListProps {
  workspaceId: string;
  onSelectSession: (sessionId: string) => void;
  onResumeSession?: (sessionId: string) => void;
  port: number | null;
  containerMode?: boolean;
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

function SessionItem({
  session,
  onSelectSession,
  onResumeSession,
}: {
  session: SessionHistoryEntry;
  onSelectSession: (sessionId: string) => void;
  onResumeSession?: (sessionId: string) => void;
}) {
  const isCompleted = session.completionReason === 'all_completed';
  const resumable = !isCompleted;

  return (
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
        {isCompleted ? (
          <Badge size="sm" variant="light" color="green" leftSection={<IconCheck size={12} />}>
            Completed
          </Badge>
        ) : (
          <Badge size="sm" variant="light" color="orange">
            Not completed
          </Badge>
        )}
      </Group>
    </Group>
  );
}

export function SessionHistoryList({ workspaceId, onSelectSession, onResumeSession, port, containerMode = false }: SessionHistoryListProps) {
  const [sessions, setSessions] = useState<SessionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

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

  // Only show sessions that have an approved plan
  const visibleSessions = sessions.filter(s => s.hasPlan);

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

  if (visibleSessions.length === 0) {
    if (containerMode) {
      return (
        <FormCard title="Previous Sessions">
          <Stack align="center" py="lg">
            <Text size="sm" c="dimmed">No previous sessions</Text>
          </Stack>
        </FormCard>
      );
    }
    return null;
  }

  // Pagination
  const totalPages = Math.ceil(visibleSessions.length / PAGE_SIZE);
  const pagedSessions = containerMode
    ? visibleSessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    : visibleSessions.slice(0, 5);

  const paginationFooter = containerMode && totalPages > 1 ? (
    <Group justify="space-between" align="center">
      <Text size="xs" c="dimmed">
        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, visibleSessions.length)} of {visibleSessions.length}
      </Text>
      <Group gap="xs">
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          leftSection={<IconChevronLeft size={14} />}
          disabled={page === 0}
          onClick={() => setPage(p => p - 1)}
        >
          Previous
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          rightSection={<IconChevronRight size={14} />}
          disabled={page >= totalPages - 1}
          onClick={() => setPage(p => p + 1)}
        >
          Next
        </Button>
      </Group>
    </Group>
  ) : undefined;

  if (containerMode) {
    return (
      <FormCard title="Previous Sessions" footer={paginationFooter}>
        <Stack gap="xs">
          {pagedSessions.map((session) => (
            <GlassCard key={session.id} hoverable p="sm" style={{ cursor: 'pointer' }}>
              <SessionItem
                session={session}
                onSelectSession={onSelectSession}
                onResumeSession={onResumeSession}
              />
            </GlassCard>
          ))}
        </Stack>
      </FormCard>
    );
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
        {pagedSessions.map((session) => (
          <GlassCard key={session.id} hoverable p="sm" style={{ cursor: 'pointer' }}>
            <SessionItem
              session={session}
              onSelectSession={onSelectSession}
              onResumeSession={onResumeSession}
            />
          </GlassCard>
        ))}
      </Stack>
    </Stack>
  );
}
