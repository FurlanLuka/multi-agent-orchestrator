import { useState, useEffect, useRef } from 'react';
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
} from '@mantine/core';
import type { AgentStatus, LogEntry } from '../types';

interface ProjectCardProps {
  project: string;
  status: AgentStatus;
  message: string;
  updatedAt: number;
  logs: LogEntry[];
}

// Status configuration for colors and labels
const statusConfig: Record<AgentStatus, { color: string; label: string }> = {
  PENDING: { color: 'gray', label: 'Pending' },
  IDLE: { color: 'green', label: 'Complete' },
  WORKING: { color: 'blue', label: 'Working' },
  DEBUGGING: { color: 'yellow', label: 'Debugging' },
  FATAL_DEBUGGING: { color: 'red', label: 'Fatal Debug' },
  FATAL_RECOVERY: { color: 'orange', label: 'Recovering' },
  READY: { color: 'teal', label: 'Ready' },
  E2E: { color: 'violet', label: 'E2E Testing' },
  E2E_FIXING: { color: 'grape', label: 'Fixing E2E' },
  BLOCKED: { color: 'red', label: 'Blocked' },
};

// Progress mapping based on status
const getStatusProgress = (status: AgentStatus): number => {
  switch (status) {
    case 'PENDING': return 0;
    case 'WORKING': return 30;
    case 'DEBUGGING': return 40;
    case 'FATAL_DEBUGGING': return 45;
    case 'FATAL_RECOVERY': return 50;
    case 'READY': return 70;
    case 'E2E': return 85;
    case 'E2E_FIXING': return 80;
    case 'IDLE': return 100;
    case 'BLOCKED': return 100;
    default: return 0;
  }
};

export function ProjectCard({ project, status, message, updatedAt, logs }: ProjectCardProps) {
  const [logType, setLogType] = useState<string>('agent');
  const scrollRef = useRef<HTMLDivElement>(null);

  const config = statusConfig[status] || statusConfig.PENDING;
  const progress = getStatusProgress(status);
  const isAnimated = status === 'WORKING' || status === 'E2E' || status === 'E2E_FIXING';

  // Filter logs based on selected type
  const filteredLogs = logs
    .filter(l => l.type === logType)
    .slice(-100); // Keep last 100 logs

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
    <Paper shadow="sm" radius="lg" p="md" withBorder>
      {/* Header: Project name + Status badge */}
      <Group justify="space-between" mb="xs">
        <Group gap="sm">
          <Text fw={700} size="lg" tt="uppercase">{project.replace(/_/g, ' ')}</Text>
          <Text size="xs" c="dimmed">{getRelativeTime()}</Text>
        </Group>
        <Badge color={config.color} variant="filled" size="lg">
          {config.label}
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
          { label: `Agent Output (${logs.filter(l => l.type === 'agent').length})`, value: 'agent' },
          { label: `Dev Server (${logs.filter(l => l.type === 'devServer').length})`, value: 'devServer' }
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
    </Paper>
  );
}
