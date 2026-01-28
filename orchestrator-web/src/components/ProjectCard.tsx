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
  TextInput,
  Collapse,
} from '@mantine/core';
import { IconShield, IconCheck, IconShieldCheck, IconRefresh, IconPlayerSkipForward, IconRotateClockwise } from '@tabler/icons-react';
import type { AgentStatus, LogEntry, ProjectTestState } from '@aio/types';

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
  onPermissionResponse?: (approved: boolean, allowAll?: boolean) => void;
  onRetry?: (hint?: string) => void;
  onSkipE2E?: () => void;
  onRestartServer?: () => void;
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
  FAILED: { color: 'red', label: 'Failed' },
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
    case 'FAILED': return 50;
    default: return 0;
  }
};

function ProjectCardInner({ project, status, message, updatedAt, logs, testState, permissionPrompt, onPermissionResponse, onRetry, onSkipE2E, onRestartServer }: ProjectCardProps) {
  const [logType, setLogType] = useState<string>('agent');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showRetryHint, setShowRetryHint] = useState(false);
  const [retryHint, setRetryHint] = useState('');

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
      {/* Header: Project name + Status badge + Action buttons */}
      <Group justify="space-between" mb="xs">
        <Group gap="sm">
          <Text fw={700} size="lg" tt="uppercase">{project.replace(/_/g, ' ')}</Text>
          <Text size="xs" c="dimmed">{getRelativeTime()}</Text>
        </Group>
        <Group gap="xs">
          <Badge color={config.color} variant="filled" size="lg">
            {getStatusLabel()}
          </Badge>

          {/* Skip E2E button for E2E or BLOCKED status */}
          {(status === 'E2E' || status === 'BLOCKED') && onSkipE2E && (
            <Button
              size="xs"
              variant="light"
              color="orange"
              leftSection={<IconPlayerSkipForward size={14} />}
              onClick={onSkipE2E}
            >
              Skip E2E
            </Button>
          )}

          {/* Restart Server button for fatal states */}
          {(status === 'FATAL_DEBUGGING') && onRestartServer && (
            <Button
              size="xs"
              variant="light"
              color="yellow"
              leftSection={<IconRotateClockwise size={14} />}
              onClick={onRestartServer}
            >
              Restart Server
            </Button>
          )}

          {/* Retry button for failed states */}
          {(status === 'FATAL_DEBUGGING' || status === 'FAILED') && onRetry && (
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconRefresh size={14} />}
              onClick={() => {
                if (showRetryHint && retryHint.trim()) {
                  onRetry(retryHint.trim());
                  setRetryHint('');
                  setShowRetryHint(false);
                } else {
                  setShowRetryHint(!showRetryHint);
                }
              }}
            >
              {showRetryHint ? 'Send Retry' : 'Retry'}
            </Button>
          )}
        </Group>
      </Group>

      {/* Retry hint input (collapsible) */}
      <Collapse in={showRetryHint && (status === 'FATAL_DEBUGGING' || status === 'FAILED')}>
        <Group gap="xs" mb="xs">
          <TextInput
            placeholder="Optional hint for the agent (e.g., check the import path)"
            value={retryHint}
            onChange={(e) => setRetryHint(e.target.value)}
            size="xs"
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && onRetry) {
                onRetry(retryHint.trim() || undefined);
                setRetryHint('');
                setShowRetryHint(false);
              }
            }}
          />
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            onClick={() => {
              setShowRetryHint(false);
              setRetryHint('');
            }}
          >
            Cancel
          </Button>
        </Group>
      </Collapse>

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
      {permissionPrompt && (() => {
        const input = permissionPrompt.toolInput || {};

        // Get command from toolInput.command or parse from toolName
        const toolMatch = permissionPrompt.toolName.match(/^(\w+)\((.+)\)$/);
        const toolNameCommand = toolMatch ? toolMatch[2] : '';

        // Prefer toolInput.command over parsed toolName
        const actualCommand = typeof input.command === 'string' ? input.command : toolNameCommand;
        const description = typeof input.description === 'string' ? input.description : null;

        // Extract base command for "Allow All" (e.g., "curl -s ..." -> "curl")
        // Only show "Allow All" if we have a valid command that looks like a real command name
        const toolTypeMatch = permissionPrompt.toolName.match(/^(\w+)/);
        const toolType = toolTypeMatch ? toolTypeMatch[1] : 'Bash';
        const baseCommand = actualCommand.trim().split(/\s+/)[0] || '';
        const isValidCommand = baseCommand.length > 0 && /^[a-zA-Z][\w.-]*$/.test(baseCommand);
        const allowAllPattern = isValidCommand ? `${toolType}(${baseCommand} *)` : null;

        return (
          <Box
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.94)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
              borderRadius: 'inherit',
              padding: '12px',
            }}
          >
            <Stack align="center" gap="xs" style={{ maxWidth: '100%', width: '100%' }}>
              <Group gap="xs">
                <IconShield size={18} color="var(--mantine-color-blue-4)" />
                <Text fw={600} size="sm" c="white">Permission Required</Text>
              </Group>

              {/* Description */}
              {description && (
                <Text size="xs" c="gray.4" ta="center" lineClamp={2}>
                  {description}
                </Text>
              )}

              {/* Command display */}
              <Text
                size="xs"
                c="white"
                ff="monospace"
                ta="center"
                lineClamp={3}
                style={{
                  wordBreak: 'break-all',
                  padding: '6px 10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  width: '100%',
                }}
              >
                {actualCommand || permissionPrompt.toolName}
              </Text>

              {/* Action buttons - compact row */}
              <Group justify="center" gap="xs" mt="xs">
                <Button
                  color="blue"
                  variant="filled"
                  size="xs"
                  leftSection={<IconCheck size={14} />}
                  onClick={() => onPermissionResponse?.(true, false)}
                >
                  Allow
                </Button>
                {allowAllPattern && (
                  <Button
                    color="teal"
                    variant="light"
                    size="xs"
                    leftSection={<IconShieldCheck size={14} />}
                    onClick={() => onPermissionResponse?.(true, true)}
                  >
                    Allow all - {allowAllPattern}
                  </Button>
                )}
                <Button
                  color="red"
                  variant="subtle"
                  size="xs"
                  onClick={() => onPermissionResponse?.(false)}
                >
                  Deny
                </Button>
              </Group>
            </Stack>
          </Box>
        );
      })()}
    </Paper>
  );
}

// Export memoized component to prevent re-renders when props haven't changed
export const ProjectCard = memo(ProjectCardInner);
