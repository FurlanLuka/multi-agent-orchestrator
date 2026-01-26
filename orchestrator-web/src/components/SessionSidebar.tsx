import {
  Stack,
  Button,
  Text,
  Divider,
  ScrollArea,
  Group,
  ActionIcon,
  Box,
  Tooltip,
} from '@mantine/core';
import {
  IconPlus,
  IconTrash,
  IconCircleFilled,
  IconPlayerStop,
} from '@tabler/icons-react';

import type { SessionSummary } from '@aio/types';

interface SessionSidebarProps {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  viewingSessionId: string | null;
  connected: boolean;
  onNewSession: () => void;
  onViewSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onStopSession?: () => void;
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
    return `Today ${timeStr}`;
  } else if (isYesterday) {
    return `Yesterday ${timeStr}`;
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  viewingSessionId,
  connected,
  onNewSession,
  onViewSession,
  onDeleteSession,
  onStopSession,
}: SessionSidebarProps) {
  return (
    <Stack gap="sm" h="100%">
      {/* Show Stop Session when active, New Session otherwise */}
      {activeSessionId && onStopSession ? (
        <Button
          leftSection={<IconPlayerStop size={16} />}
          variant="light"
          color="red"
          fullWidth
          onClick={onStopSession}
          disabled={!connected}
        >
          Stop Session
        </Button>
      ) : (
        <Button
          leftSection={<IconPlus size={16} />}
          variant="light"
          fullWidth
          onClick={onNewSession}
          disabled={!connected}
        >
          New Session
        </Button>
      )}

      <Divider label="Sessions" labelPosition="center" />

      {/* Session List */}
      <ScrollArea flex={1} type="auto" offsetScrollbars>
        <Stack gap={4}>
          {sessions.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="md">
              No sessions yet
            </Text>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isViewing = session.id === viewingSessionId;

              return (
                <Box
                  key={session.id}
                  py={8}
                  px={10}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 'var(--mantine-radius-sm)',
                    backgroundColor: isViewing
                      ? 'var(--mantine-color-blue-light)'
                      : 'transparent',
                    transition: 'background-color 0.15s ease',
                  }}
                  onClick={() => onViewSession(session.id)}
                  onMouseEnter={(e) => {
                    if (!isViewing) {
                      e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isViewing) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <Group gap="xs" wrap="nowrap" justify="space-between">
                    {/* Left: Active indicator + Title */}
                    <Group gap={8} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                      {isActive && (
                        <IconCircleFilled size={8} color="var(--mantine-color-green-6)" style={{ flexShrink: 0 }} />
                      )}
                      <Tooltip label={session.feature} openDelay={500}>
                        <Text
                          size="sm"
                          fw={isActive ? 600 : 400}
                          lineClamp={1}
                          style={{ flex: 1 }}
                        >
                          {session.feature}
                        </Text>
                      </Tooltip>
                    </Group>

                    {/* Right: Date + Delete */}
                    <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                      <Text size="xs" c="dimmed">
                        {formatDate(session.startedAt)}
                      </Text>
                      {!isActive && (
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="gray"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                          }}
                          disabled={!connected}
                        >
                          <IconTrash size={12} />
                        </ActionIcon>
                      )}
                    </Group>
                  </Group>
                </Box>
              );
            })
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
