import { useState } from 'react';
import {
  Box,
  Stack,
  Group,
  Text,
  ActionIcon,
  Tooltip,
  Badge,
  Transition,
  Collapse,
  Loader,
} from '@mantine/core';
import {
  IconPlayerStop,
  IconRefresh,
  IconFileText,
  IconChevronUp,
  IconChevronDown,
  IconX,
  IconExternalLink,
} from '@tabler/icons-react';
import type { DevServerState } from '@orchy/types';
import { glass, radii } from '../../theme/tokens';
import { openUrl } from '../../lib/tauri';

interface DevServerPanelProps {
  servers: DevServerState[];
  onStop: (project: string) => void;
  onStopAll: () => void;
  onRestart: (project: string) => void;
  onViewLogs: (project: string) => void;
}

/**
 * Floating control panel for dev servers.
 * Shows in bottom-left corner when dev servers are running.
 * Collapsed: pill showing server count
 * Expanded: list with controls per server
 */
export function DevServerPanel({
  servers,
  onStop,
  onStopAll,
  onRestart,
  onViewLogs,
}: DevServerPanelProps) {
  const [expanded, setExpanded] = useState(false);

  // Don't render if no servers
  if (servers.length === 0) {
    return null;
  }

  const runningCount = servers.filter(s => s.status === 'running').length;
  const startingCount = servers.filter(s => s.status === 'starting').length;
  const errorCount = servers.filter(s => s.status === 'error').length;

  const getStatusColor = (status: DevServerState['status']) => {
    switch (status) {
      case 'running': return 'sage';
      case 'starting': return 'honey';
      case 'stopping': return 'gray';
      case 'error': return 'rose';
      default: return 'gray';
    }
  };

  const getStatusIcon = (status: DevServerState['status']) => {
    switch (status) {
      case 'running': return <Box w={8} h={8} style={{ borderRadius: '50%', background: 'var(--mantine-color-sage-5)' }} />;
      case 'starting':
      case 'stopping':
        return <Loader size={10} color="honey" />;
      case 'error': return <Box w={8} h={8} style={{ borderRadius: '50%', background: 'var(--mantine-color-rose-5)' }} />;
      default: return <Box w={8} h={8} style={{ borderRadius: '50%', background: 'gray' }} />;
    }
  };

  return (
    <Transition mounted transition="slide-up" duration={200}>
      {(styles) => (
        <Box
          style={{
            ...styles,
            position: 'fixed',
            bottom: 20,
            left: 20,
            zIndex: 100,
            maxWidth: expanded ? 320 : 'auto',
            minWidth: expanded ? 280 : 'auto',
          }}
        >
          <Box
            style={{
              background: glass.formCard.bg,
              border: glass.formCard.border,
              boxShadow: glass.formCard.shadow,
              borderRadius: expanded ? radii.card : 24,
              overflow: 'hidden',
            }}
          >
            {/* Collapsed pill / Header */}
            <Group
              gap="xs"
              px="md"
              py="sm"
              style={{
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setExpanded(!expanded)}
            >
              <Group gap={6}>
                {runningCount > 0 && (
                  <Box w={8} h={8} style={{ borderRadius: '50%', background: 'var(--mantine-color-sage-5)' }} />
                )}
                {startingCount > 0 && (
                  <Loader size={10} color="honey" />
                )}
                {errorCount > 0 && (
                  <Box w={8} h={8} style={{ borderRadius: '50%', background: 'var(--mantine-color-rose-5)' }} />
                )}
              </Group>

              <Text size="sm" fw={500}>
                {servers.length} Dev Server{servers.length !== 1 ? 's' : ''}
              </Text>

              <ActionIcon variant="subtle" size="xs" color="gray">
                {expanded ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
              </ActionIcon>
            </Group>

            {/* Expanded content */}
            <Collapse in={expanded}>
              <Stack gap={0} px="md" pb="md">
                {/* Server list */}
                <Stack gap="xs">
                  {servers.map((server) => (
                    <Box
                      key={server.project}
                      p="xs"
                      style={{
                        background: 'rgba(0, 0, 0, 0.02)',
                        borderRadius: radii.input,
                      }}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                          {getStatusIcon(server.status)}
                          <Text size="sm" fw={500} truncate style={{ flex: 1 }}>
                            {server.project}
                          </Text>
                        </Group>

                        <Group gap={4} wrap="nowrap">
                          {server.port && (
                            <Badge size="xs" color={getStatusColor(server.status)} variant="light">
                              :{server.port}
                            </Badge>
                          )}

                          {server.port && server.status === 'running' && (
                            <Tooltip label="Open in browser" position="top" withArrow>
                              <ActionIcon
                                variant="subtle"
                                size="xs"
                                color="gray"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openUrl(`http://localhost:${server.port}`);
                                }}
                              >
                                <IconExternalLink size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}

                          <Tooltip label="View logs" position="top" withArrow>
                            <ActionIcon
                              variant="subtle"
                              size="xs"
                              color="gray"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewLogs(server.project);
                              }}
                            >
                              <IconFileText size={14} />
                            </ActionIcon>
                          </Tooltip>

                          <Tooltip label="Restart" position="top" withArrow>
                            <ActionIcon
                              variant="subtle"
                              size="xs"
                              color="gray"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRestart(server.project);
                              }}
                              disabled={server.status === 'starting' || server.status === 'stopping'}
                            >
                              <IconRefresh size={14} />
                            </ActionIcon>
                          </Tooltip>

                          <Tooltip label="Stop" position="top" withArrow>
                            <ActionIcon
                              variant="subtle"
                              size="xs"
                              color="rose"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStop(server.project);
                              }}
                              disabled={server.status === 'stopped' || server.status === 'stopping'}
                            >
                              <IconPlayerStop size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Group>

                      {server.error && (
                        <Text size="xs" c="rose" mt={4}>
                          {server.error}
                        </Text>
                      )}
                    </Box>
                  ))}
                </Stack>

                {/* Actions */}
                <Group justify="flex-end" mt="sm">
                  <Tooltip label="Stop all servers" position="top" withArrow>
                    <ActionIcon
                      variant="light"
                      color="rose"
                      size="sm"
                      onClick={onStopAll}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Stack>
            </Collapse>
          </Box>
        </Box>
      )}
    </Transition>
  );
}
