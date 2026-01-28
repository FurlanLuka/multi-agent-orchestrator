import { useState } from 'react';
import {
  Box,
  Group,
  Text,
  Badge,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import {
  IconCircle,
  IconCircleCheck,
  IconCircleX,
  IconLoader,
  IconClock,
  IconChevronRight,
  IconChevronDown,
} from '@tabler/icons-react';
import type { TaskState, TaskStatus } from '@aio/types';
import { MarkdownMessage } from '../MarkdownMessage';

// Get status icon for tasks
function getTaskStatusIcon(status?: TaskStatus) {
  if (!status || status === 'pending') return <IconCircle size={14} />;
  if (status === 'completed') return <IconCircleCheck size={14} />;
  if (status === 'failed' || status === 'e2e_failed') return <IconCircleX size={14} />;
  if (status === 'working' || status === 'verifying' || status === 'fixing' || status === 'e2e') {
    return <IconLoader size={14} className="animate-spin" />;
  }
  if (status === 'waiting') return <IconClock size={14} />;
  return <IconCircle size={14} />;
}

// Get status color for tasks
function getTaskStatusColor(status?: TaskStatus): string {
  if (!status || status === 'pending') return 'gray';
  if (status === 'completed') return 'green';
  if (status === 'failed' || status === 'e2e_failed') return 'red';
  if (status === 'working') return 'blue';
  if (status === 'verifying') return 'cyan';
  if (status === 'fixing') return 'orange';
  if (status === 'waiting') return 'yellow';
  if (status === 'e2e') return 'violet';
  return 'gray';
}

interface TaskItem {
  name: string;
  project: string;
  task?: string;
}

interface TaskListProps {
  tasks: { task: TaskItem; idx: number }[];
  taskStates?: TaskState[];
  isApproval?: boolean;
}

export function TaskList({ tasks, taskStates, isApproval }: TaskListProps) {
  const [expandedTaskIdx, setExpandedTaskIdx] = useState<number | null>(null);

  return (
    <Box>
      <Text fw={600} size="xs" c="dimmed" tt="uppercase" mb={4}>Tasks</Text>
      <Box
        style={{
          border: '1px solid var(--mantine-color-gray-3)',
          borderRadius: 'var(--mantine-radius-sm)',
          overflow: 'hidden',
        }}
      >
        {tasks.map(({ task, idx }, i) => {
          const state = taskStates?.find(t => t.taskIndex === idx);
          const status = state?.status;
          const icon = isApproval ? <IconCircle size={14} /> : getTaskStatusIcon(status);
          const color = isApproval ? 'gray' : getTaskStatusColor(status);
          const isExpanded = expandedTaskIdx === idx;
          const isLast = i === tasks.length - 1;

          return (
            <Box key={idx}>
              <UnstyledButton
                w="100%"
                p="xs"
                style={{
                  backgroundColor: `var(--mantine-color-${color}-0)`,
                  borderBottom: isLast && !isExpanded ? 'none' : '1px solid var(--mantine-color-gray-2)',
                }}
                onClick={() => setExpandedTaskIdx(isExpanded ? null : idx)}
              >
                <Group gap="xs" wrap="nowrap">
                  <ThemeIcon size="xs" variant="transparent" color={color}>
                    {icon}
                  </ThemeIcon>
                  <Text size="sm" style={{ flex: 1 }} lineClamp={1}>
                    {task.name}
                  </Text>
                  {status && !isApproval && (
                    <Badge size="xs" variant="light" color={color}>
                      {status}
                    </Badge>
                  )}
                  {task.task && (
                    <ThemeIcon size="xs" variant="transparent" color="gray">
                      {isExpanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                    </ThemeIcon>
                  )}
                </Group>
              </UnstyledButton>
              {/* Expandable task description */}
              {task.task && isExpanded && (
                <Box
                  p="xs"
                  style={{
                    backgroundColor: 'var(--mantine-color-gray-0)',
                    borderBottom: isLast ? 'none' : '1px solid var(--mantine-color-gray-2)',
                  }}
                >
                  <MarkdownMessage content={task.task} />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
