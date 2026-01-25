import { useState, useEffect, useRef, useMemo, memo } from 'react';
import {
  Paper,
  Group,
  Text,
  Badge,
  Progress,
  SegmentedControl,
  ScrollArea,
  Box,
  Code,
  Stack,
  Button,
} from '@mantine/core';
import { IconShieldQuestion, IconCheck, IconX } from '@tabler/icons-react';
import type { AgentStatus, LogEntry, ProjectTestState } from '../types';

interface ProjectCardProps {
  project: string;
  status: AgentStatus;
  message: string;
  updatedAt: number;
  logs: LogEntry[];
  testState?: ProjectTestState;
  permissionPrompt?: {
    toolName: string;
    toolInput: Record<string, unknown>;
  } | null;
  onPermissionResponse?: (approved: boolean) => void;
}

// Status configuration for colors and labels
const statusConfig: Record<AgentStatus, { color: string; label: string }> = {
  PENDING: { color: 'gray', label: 'Pending' },
  IDLE: { color: 'green', label: 'Complete' },
  WORKING: { color: 'blue', label: 'Working' },
  DEBUGGING: { color: 'yellow', label: 'Debugging' },
  FATAL_DEBUGGING: { color: 'red', label: 'Fatal Debug' },
  READY: { color: 'teal', label: 'Ready' },
  E2E: { color: 'violet', label: 'E2E Testing' },
  E2E_FIXING: { color: 'grape', label: 'Fixing E2E' },
  BLOCKED: { color: 'orange', label: 'Blocked' },
};

// Progress mapping based on status
const getStatusProgress = (status: AgentStatus): number => {
  switch (status) {
    case 'PENDING': return 0;
    case 'BLOCKED': return 5;  // Waiting on dependencies
    case 'WORKING': return 30;
    case 'DEBUGGING': return 40;
    case 'FATAL_DEBUGGING': return 45;
    case 'READY': return 70;
    case 'E2E': return 85;
    case 'E2E_FIXING': return 80;
    case 'IDLE': return 100;
    default: return 0;
  }
};

function ProjectCardInner({ project, status, message, updatedAt, logs, testState, permissionPrompt, onPermissionResponse }: ProjectCardProps) {
  const [logType, setLogType] = useState<string>('agent');
  const scrollRef = useRef<HTMLDivElement>(null);

  const config = statusConfig[status] || statusConfig.PENDING;
  const progress = getStatusProgress(status);
  const isAnimated = status === 'WORKING' || status === 'E2E' || status === 'E2E_FIXING';

  // Determine if truly complete (tasks done + tests passed)
  const isTrulyComplete = useMemo(() => {
    if (status !== 'IDLE') return false;
    // No tests = complete
    if (!testState || testState.scenarios.length === 0) return true;
    // All tests passed = complete
    return testState.scenarios.every(s => s.status === 'passed');
  }, [status, testState]);

  // Get the display label for status badge
  const getStatusLabel = () => {
    if (status === 'IDLE') {
      return isTrulyComplete ? 'Complete' : 'Tasks Done';
    }
    return config.label;
  };

  // Memoize log counts for tabs
  const logCounts = useMemo(() => ({
    agent: logs.filter(l => l.type === 'agent').length,
    devServer: logs.filter(l => l.type === 'devServer').length,
  }), [logs]);

  // Filter logs based on selected type - memoized
  const filteredLogs = useMemo(
    () => logs.filter(l => l.type === logType).slice(-100),
    [logs, logType]
  );

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [filteredLogs.length]);

  // Format relative time
  const getRelativeTime = () => {
    const seconds = Math.floor((Date.now() - updatedAt) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <Paper shadow="sm" radius="lg" p="md" withBorder style={{ position: 'relative' }}>
      {/* Header: Project name + Status badge */}
      <Group justify="space-between" mb="xs">
        <Group gap="sm">
          <Text fw={700} size="lg" tt="uppercase">{project.replace(/_/g, ' ')}</Text>
          <Text size="xs" c="dimmed">{getRelativeTime()}</Text>
        </Group>
        <Badge color={config.color} variant="filled" size="lg">
          {getStatusLabel()}
        </Badge>
      </Group>

      {/* Progress bar */}
      <Progress
        value={progress}
        color={config.color}
        animated={isAnimated}
        size="sm"
        mb="xs"
      />

      {/* Status message */}
      <Text size="sm" c="dimmed" mb="md">{message || 'Waiting...'}</Text>

      {/* Log type toggle */}
      <SegmentedControl
        value={logType}
        onChange={setLogType}
        data={[
          { label: `Agent Output (${logCounts.agent})`, value: 'agent' },
          { label: `Dev Server (${logCounts.devServer})`, value: 'devServer' },
        ]}
        size="xs"
        mb="xs"
        fullWidth
      />

      {/* Log output (dark terminal style) */}
      <ScrollArea h={200} viewportRef={scrollRef}>
        <Box style={{
          backgroundColor: '#1e1e1e',
          padding: 12,
          borderRadius: 8,
          minHeight: 180,
        }}>
          {filteredLogs.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" style={{ color: '#666' }}>
              No {logType === 'agent' ? 'agent output' : 'dev server logs'} yet
            </Text>
          ) : (
            filteredLogs.map((log, i) => (
              <Code
                key={`${log.timestamp}-${i}`}
                block
                style={{
                  backgroundColor: 'transparent',
                  color: log.stream === 'stderr' ? '#ff6b6b' : '#abb2bf',
                  fontSize: '12px',
                  padding: '2px 0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {log.text}
              </Code>
            ))
          )}
        </Box>
      </ScrollArea>

      {/* Permission overlay */}
      {permissionPrompt && (
        <Box
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            borderRadius: 'inherit',
          }}
        >
          <Stack align="center" gap="md" p="xl">
            <IconShieldQuestion size={48} color="var(--mantine-color-yellow-5)" />
            <Text fw={600} size="lg" c="white">Permission Required</Text>

            <Code block style={{ maxWidth: '100%', overflow: 'auto' }}>
              {permissionPrompt.toolName}
            </Code>

            {permissionPrompt.toolInput && Object.keys(permissionPrompt.toolInput).length > 0 && (
              <Code block style={{ fontSize: '11px', maxHeight: '100px', overflow: 'auto' }}>
                {JSON.stringify(permissionPrompt.toolInput, null, 2)}
              </Code>
            )}

            <Group mt="md">
              <Button
                color="green"
                leftSection={<IconCheck size={16} />}
                onClick={() => onPermissionResponse?.(true)}
              >
                Allow
              </Button>
              <Button
                color="red"
                variant="light"
                leftSection={<IconX size={16} />}
                onClick={() => onPermissionResponse?.(false)}
              >
                Deny
              </Button>
            </Group>

            <Text size="xs" c="dimmed" ta="center">
              Denying will stop the agent and mark project as failed
            </Text>
          </Stack>
        </Box>
      )}
    </Paper>
  );
}

// Export memoized component to prevent re-renders when props haven't changed
export const ProjectCard = memo(ProjectCardInner);
