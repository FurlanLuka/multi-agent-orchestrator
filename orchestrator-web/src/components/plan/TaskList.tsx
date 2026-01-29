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
import type { TaskState, TaskStatus } from '@orchy/types';
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

// Get status color for tasks (warm palette)
function getTaskStatusColor(status?: TaskStatus): string {
  if (!status || status === 'pending') return 'gray';
  if (status === 'completed') return 'sage';
  if (status === 'failed' || status === 'e2e_failed') return 'rose';
  if (status === 'working') return 'peach';
  if (status === 'verifying') return 'peach';
  if (status === 'fixing') return 'honey';
  if (status === 'waiting') return 'honey';
  if (status === 'e2e') return 'lavender';
  return 'gray';
}

// Get background color based on status
function getStatusBgColor(status?: TaskStatus): string {
  if (!status || status === 'pending') return 'rgba(160, 130, 110, 0.04)';
  if (status === 'completed') return 'rgba(74, 145, 73, 0.08)';
  if (status === 'failed' || status === 'e2e_failed') return 'rgba(209, 67, 67, 0.08)';
  if (status === 'working' || status === 'verifying') return 'rgba(245, 133, 101, 0.08)';
  if (status === 'fixing') return 'rgba(201, 138, 46, 0.08)';
  if (status === 'waiting') return 'rgba(201, 138, 46, 0.06)';
  if (status === 'e2e') return 'rgba(126, 95, 196, 0.08)';
  return 'rgba(160, 130, 110, 0.04)';
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
          border: '1px solid var(--border-subtle)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {tasks.map(({ task, idx }, i) => {
          const state = taskStates?.find(t => t.taskIndex === idx);
          const status = state?.status;
          const icon = isApproval ? <IconCircle size={14} /> : getTaskStatusIcon(status);
          const color = isApproval ? 'gray' : getTaskStatusColor(status);
          const bgColor = isApproval ? 'rgba(160, 130, 110, 0.04)' : getStatusBgColor(status);
          const isExpanded = expandedTaskIdx === idx;
          const isLast = i === tasks.length - 1;

          return (
            <Box key={idx}>
              <UnstyledButton
                w="100%"
                p="xs"
                style={{
                  backgroundColor: bgColor,
                  borderBottom: isLast && !isExpanded ? 'none' : '1px solid var(--border-subtle)',
                }}
                onClick={() => setExpandedTaskIdx(isExpanded ? null : idx)}
              >
                <Group gap="xs" wrap="nowrap">
                  <ThemeIcon size="xs" variant="transparent" color={color}>
                    {icon}
                  </ThemeIcon>
                  <Text size="sm" style={{ flex: 1, color: 'var(--text-body)' }} lineClamp={1}>
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
                    backgroundColor: 'rgba(160, 130, 110, 0.04)',
                    borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
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
