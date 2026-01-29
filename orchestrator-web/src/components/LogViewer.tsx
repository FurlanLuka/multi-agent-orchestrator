import { useRef, useEffect, useState } from 'react';
import {
  Paper,
  ScrollArea,
  Text,
  Group,
  Badge,
  ActionIcon,
  SegmentedControl,
  Stack,
  Code,
} from '@mantine/core';
import { IconTrash, IconArrowDown } from '@tabler/icons-react';
import type { LogEntry } from '@orchy/types';

interface LogViewerProps {
  logs: LogEntry[];
  projects: string[];
  onClearLogs: () => void;
}

export function LogViewer({ logs, projects, onClearLogs }: LogViewerProps) {
  const [filter, setFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter logs
  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter(l => l.project === filter);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [filteredLogs, autoScroll]);

  const getLogColor = (entry: LogEntry) => {
    if (entry.stream === 'stderr') return 'red';
    if (entry.type === 'agent') return 'blue';
    return 'gray';
  };

  const filterOptions = [
    { value: 'all', label: 'All' },
    ...projects.map(p => ({ value: p, label: p })),
  ];

  return (
    <Paper shadow="sm" p="md" h="100%">
      <Stack h="100%" gap="md">
        <Group justify="space-between">
          <Text fw={600} size="lg">Logs</Text>
          <Group gap="xs">
            {projects.length > 0 && (
              <SegmentedControl
                size="xs"
                value={filter}
                onChange={setFilter}
                data={filterOptions}
              />
            )}
            <ActionIcon
              variant={autoScroll ? 'filled' : 'light'}
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
            >
              <IconArrowDown size={16} />
            </ActionIcon>
            <ActionIcon variant="light" color="red" onClick={onClearLogs} title="Clear logs">
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        </Group>

        <ScrollArea h="calc(100% - 50px)" viewportRef={scrollRef}>
          {filteredLogs.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              No logs yet. Logs will appear here when agents start working.
            </Text>
          ) : (
            <Stack gap={2}>
              {filteredLogs.map((entry, i) => (
                <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
                  <Text size="xs" c="dimmed" w={80} style={{ flexShrink: 0 }}>
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </Text>
                  <Badge
                    size="xs"
                    color={entry.type === 'agent' ? 'blue' : 'green'}
                    w={70}
                    style={{ flexShrink: 0 }}
                  >
                    {entry.project}
                  </Badge>
                  <Code
                    block={false}
                    c={getLogColor(entry)}
                    style={{
                      fontSize: '12px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      flex: 1,
                    }}
                  >
                    {entry.text}
                  </Code>
                </Group>
              ))}
            </Stack>
          )}
        </ScrollArea>
      </Stack>
    </Paper>
  );
}
