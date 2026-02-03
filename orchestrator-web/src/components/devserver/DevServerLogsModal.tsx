import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Stack,
  Text,
  Group,
  ActionIcon,
  Tooltip,
  Box,
  ScrollArea,
  Switch,
  Badge,
} from '@mantine/core';
import {
  IconRefresh,
  IconArrowDown,
  IconExternalLink,
} from '@tabler/icons-react';
import type { DevServerLogEntry, DevServerState } from '@orchy/types';

interface DevServerLogsModalProps {
  opened: boolean;
  server: DevServerState | null;
  logs: DevServerLogEntry[];
  onClose: () => void;
  onRestart: (project: string) => void;
  onRefreshLogs: (project: string) => void;
}

/**
 * Modal showing logs for a single dev server with auto-scroll toggle.
 */
export function DevServerLogsModal({
  opened,
  server,
  logs,
  onClose,
  onRestart,
  onRefreshLogs,
}: DevServerLogsModalProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Refresh logs when modal opens
  useEffect(() => {
    if (opened && server) {
      onRefreshLogs(server.project);
    }
  }, [opened, server, onRefreshLogs]);

  // Auto-scroll when logs change
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [logs, autoScroll]);

  const handleOpenInBrowser = () => {
    if (server?.url) {
      window.open(server.url, '_blank');
    }
  };

  const getStatusColor = (status: DevServerState['status']) => {
    switch (status) {
      case 'running': return 'sage';
      case 'starting': return 'honey';
      case 'stopping': return 'gray';
      case 'error': return 'rose';
      default: return 'gray';
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Text fw={600}>{server?.project || 'Dev Server'}</Text>
          {server && (
            <Badge size="sm" color={getStatusColor(server.status)} variant="light">
              {server.status}
            </Badge>
          )}
        </Group>
      }
      centered
      size="lg"
      styles={{
        content: { maxHeight: '80vh' },
      }}
    >
      {!server ? (
        <Stack p="xl" align="center">
          <Text c="dimmed">No server selected</Text>
        </Stack>
      ) : (
        <Stack gap="sm" style={{ height: '60vh' }}>
          {/* Controls */}
          <Group justify="space-between">
            <Group gap="xs">
              {server.url && (
                <>
                  <Text size="xs" c="dimmed">
                    {server.url}
                  </Text>
                  <Tooltip label="Open in browser" position="right" withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="xs"
                      onClick={handleOpenInBrowser}
                    >
                      <IconExternalLink size={14} />
                    </ActionIcon>
                  </Tooltip>
                </>
              )}
            </Group>

            <Group gap="sm">
              <Switch
                label="Auto-scroll"
                size="xs"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.currentTarget.checked)}
              />

              <Tooltip label="Restart server" position="left" withArrow>
                <ActionIcon
                  variant="light"
                  color="gray"
                  size="sm"
                  onClick={() => onRestart(server.project)}
                  disabled={server.status === 'starting' || server.status === 'stopping'}
                >
                  <IconRefresh size={14} />
                </ActionIcon>
              </Tooltip>

              {!autoScroll && (
                <Tooltip label="Scroll to bottom" position="left" withArrow>
                  <ActionIcon
                    variant="light"
                    color="gray"
                    size="sm"
                    onClick={() => {
                      if (scrollRef.current) {
                        scrollRef.current.scrollTo({
                          top: scrollRef.current.scrollHeight,
                          behavior: 'smooth',
                        });
                      }
                    }}
                  >
                    <IconArrowDown size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Group>

          {/* Log content */}
          <ScrollArea
            viewportRef={scrollRef}
            style={{ flex: 1 }}
            styles={{
              viewport: {
                background: '#1a1a1a',
                borderRadius: 8,
              },
            }}
          >
            <Box
              p="sm"
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {logs.length === 0 ? (
                <Text c="gray.6" ta="center" py="xl">
                  No logs available
                </Text>
              ) : (
                logs.map((entry, idx) => (
                  <Box
                    key={idx}
                    style={{
                      color: entry.stream === 'stderr' ? '#ff8a8a' : '#d4d4d4',
                    }}
                  >
                    {entry.text}
                  </Box>
                ))
              )}
            </Box>
          </ScrollArea>
        </Stack>
      )}
    </Modal>
  );
}
