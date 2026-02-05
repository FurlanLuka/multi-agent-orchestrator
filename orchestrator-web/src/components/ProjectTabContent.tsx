import { useState, useEffect, useRef, useMemo, memo } from 'react';
import {
  Group,
  Text,
  Badge,
  Progress,
  ScrollArea,
  Box,
  Code,
  Button,
  Collapse,
  Stack,
} from '@mantine/core';
import { IconRefresh, IconPlayerSkipForward, IconRotateClockwise } from '@tabler/icons-react';
import type { AgentStatus, LogEntry, ProjectTestState } from '@orchy/types';
import { GlassTextInput, GlassSegmentedControl } from '../theme';

interface ProjectTabContentProps {
  project: string;
  status: AgentStatus;
  message: string;
  updatedAt: number;
  logs: LogEntry[];
  testState?: ProjectTestState;
  onRetry?: (hint?: string) => void;
  onSkipE2E?: () => void;
  onRestartServer?: () => void;
}

// Status configuration for colors and labels
const statusConfig: Record<AgentStatus, { color: string; label: string }> = {
  PENDING: { color: 'gray', label: 'Pending' },
  IDLE: { color: 'sage', label: 'Complete' },
  WORKING: { color: 'peach', label: 'Working' },
  DEBUGGING: { color: 'honey', label: 'Debugging' },
  FATAL_DEBUGGING: { color: 'rose', label: 'Fatal Debug' },
  READY: { color: 'sage', label: 'Ready' },
  E2E: { color: 'lavender', label: 'E2E Testing' },
  E2E_FIXING: { color: 'lavender', label: 'Fixing E2E' },
  BLOCKED: { color: 'honey', label: 'Blocked' },
  FAILED: { color: 'rose', label: 'Failed' },
};

// Progress mapping based on status
const getStatusProgress = (status: AgentStatus): number => {
  switch (status) {
    case 'PENDING': return 0;
    case 'BLOCKED': return 5;
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

function ProjectTabContentInner({
  project: _project,
  status,
  message,
  updatedAt,
  logs,
  testState,
  onRetry,
  onSkipE2E,
  onRestartServer,
}: ProjectTabContentProps) {
  const [logType, setLogType] = useState<string>('agent');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showRetryHint, setShowRetryHint] = useState(false);
  const [retryHint, setRetryHint] = useState('');

  const config = statusConfig[status] || statusConfig.PENDING;
  const progress = getStatusProgress(status);
  const isAnimated = status === 'WORKING' || status === 'E2E' || status === 'E2E_FIXING';

  // Determine if truly complete
  const isTrulyComplete = useMemo(() => {
    if (status !== 'IDLE') return false;
    if (!testState || testState.scenarios.length === 0) return true;
    return testState.scenarios.every(s => s.status === 'passed');
  }, [status, testState]);

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

  // Filter logs based on selected type
  const filteredLogs = useMemo(
    () => logs.filter(l => l.type === logType).slice(-100),
    [logs, logType]
  );

  // Auto-scroll to bottom
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
    <Box style={{ position: 'relative' }}>
      <Stack gap="sm">
        {/* Status row */}
        <Group justify="space-between">
          <Group gap="sm">
            <Badge color={config.color} variant="filled" size="lg">
              {getStatusLabel()}
            </Badge>
            <Text size="xs" c="dimmed">{getRelativeTime()}</Text>
          </Group>
          <Group gap="xs">
            {/* Skip E2E button */}
            {(status === 'E2E' || status === 'BLOCKED') && onSkipE2E && (
              <Button
                size="xs"
                variant="light"
                color="honey"
                leftSection={<IconPlayerSkipForward size={14} />}
                onClick={onSkipE2E}
              >
                Skip E2E
              </Button>
            )}

            {/* Restart Server button */}
            {(status === 'FATAL_DEBUGGING') && onRestartServer && (
              <Button
                size="xs"
                variant="light"
                color="honey"
                leftSection={<IconRotateClockwise size={14} />}
                onClick={onRestartServer}
              >
                Restart Server
              </Button>
            )}

            {/* Retry button */}
            {(status === 'FATAL_DEBUGGING' || status === 'FAILED') && onRetry && (
              <Button
                size="xs"
                variant="light"
                color="rose"
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
          <Group gap="xs">
            <GlassTextInput
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
          radius="xl"
        />

        {/* Status message */}
        <Text size="sm" c="dimmed">{message || 'Waiting...'}</Text>

        {/* Log type toggle */}
        <GlassSegmentedControl
          value={logType}
          onChange={setLogType}
          data={[
            { label: `Agent Output (${logCounts.agent})`, value: 'agent' },
            { label: `Dev Server (${logCounts.devServer})`, value: 'devServer' },
          ]}
          size="xs"
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
              <Text size="xs" ta="center" style={{ color: '#666' }}>
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
      </Stack>

    </Box>
  );
}

// Export memoized component
export const ProjectTabContent = memo(ProjectTabContentInner);
