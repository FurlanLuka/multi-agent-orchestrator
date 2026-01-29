import {
  Box,
  Group,
  Text,
  Badge,
  ThemeIcon,
} from '@mantine/core';
import {
  IconCircle,
  IconCircleCheck,
  IconCircleX,
  IconLoader,
} from '@tabler/icons-react';
import type { TaskState, ProjectTestState, TestScenarioStatus } from '@aio/types';

// Get status icon for tests
function getTestStatusIcon(status?: TestScenarioStatus) {
  if (!status || status === 'pending') return <IconCircle size={14} />;
  if (status === 'passed') return <IconCircleCheck size={14} />;
  if (status === 'failed') return <IconCircleX size={14} />;
  if (status === 'running') return <IconLoader size={14} className="animate-spin" />;
  return <IconCircle size={14} />;
}

// Get status color for tests (warm palette)
function getTestStatusColor(status?: TestScenarioStatus): string {
  if (!status || status === 'pending') return 'gray';
  if (status === 'passed') return 'sage';
  if (status === 'failed') return 'rose';
  if (status === 'running') return 'lavender';
  return 'gray';
}

// Get background color based on status
function getTestBgColor(status?: TestScenarioStatus): string {
  if (!status || status === 'pending') return 'rgba(160, 130, 110, 0.04)';
  if (status === 'passed') return 'rgba(74, 145, 73, 0.08)';
  if (status === 'failed') return 'rgba(209, 67, 67, 0.08)';
  if (status === 'running') return 'rgba(126, 95, 196, 0.08)';
  return 'rgba(160, 130, 110, 0.04)';
}

// Get E2E status for a project based on task states
export function getProjectE2EStatus(
  project: string,
  taskStates?: TaskState[],
  testStates?: Record<string, ProjectTestState>,
): 'waiting' | 'in_progress' | 'passed' | 'failed' | null {
  const projectTests = testStates?.[project]?.scenarios || [];
  if (projectTests.length === 0) return null;

  // Check if any task is in E2E state
  const projectTasks = taskStates?.filter(t => t.project === project) || [];
  const hasE2ETask = projectTasks.some(t => t.status === 'e2e');
  const hasE2EFailedTask = projectTasks.some(t => t.status === 'e2e_failed');

  // Check test results
  const allPassed = projectTests.every(s => s.status === 'passed');
  const anyFailed = projectTests.some(s => s.status === 'failed');
  const anyRunning = projectTests.some(s => s.status === 'running');

  if (allPassed) return 'passed';
  if (anyFailed || hasE2EFailedTask) return 'failed';
  if (anyRunning || hasE2ETask) return 'in_progress';

  // All pending - check if project tasks are done
  const allTasksComplete = projectTasks.length > 0 &&
    projectTasks.every(t => t.status === 'completed' || t.status === 'e2e' || t.status === 'e2e_failed');

  return allTasksComplete ? 'in_progress' : 'waiting';
}

interface TestListProps {
  project: string;
  scenarios: string[];
  taskStates?: TaskState[];
  testStates?: Record<string, ProjectTestState>;
  isApproval?: boolean;
}

export function TestList({ project, scenarios, taskStates, testStates, isApproval }: TestListProps) {
  return (
    <Box>
      <Group gap="xs" mb={4}>
        <Text fw={600} size="xs" c="dimmed" tt="uppercase">Tests</Text>
        {!isApproval && (() => {
          const e2eStatus = getProjectE2EStatus(project, taskStates, testStates);
          if (!e2eStatus) return null;
          const statusConfig = {
            waiting: { label: 'Waiting for Tasks', color: 'gray' },
            in_progress: { label: 'E2E In Progress', color: 'lavender' },
            passed: { label: 'All Passed', color: 'sage' },
            failed: { label: 'Failed', color: 'rose' },
          };
          const config = statusConfig[e2eStatus];
          return (
            <Badge size="xs" variant="light" color={config.color}>
              {config.label}
            </Badge>
          );
        })()}
      </Group>
      <Box
        style={{
          border: '1px solid var(--border-subtle)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {scenarios.map((scenario, idx) => {
          const testState = testStates?.[project]?.scenarios?.find(s => s.name === scenario);
          const status = testState?.status;
          const icon = isApproval ? <IconCircle size={14} /> : getTestStatusIcon(status);
          const color = isApproval ? 'gray' : getTestStatusColor(status);
          const bgColor = isApproval ? 'rgba(160, 130, 110, 0.04)' : getTestBgColor(status);
          const isLast = idx === scenarios.length - 1;

          return (
            <Box
              key={idx}
              p="xs"
              style={{
                backgroundColor: bgColor,
                borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
              }}
            >
              <Group gap="xs" wrap="nowrap">
                <ThemeIcon size="xs" variant="transparent" color={color}>
                  {icon}
                </ThemeIcon>
                <Text size="sm" style={{ flex: 1, color: 'var(--text-body)' }} lineClamp={1}>
                  {scenario}
                </Text>
                {testState?.error && (
                  <Text size="xs" style={{ maxWidth: '150px', color: 'var(--color-error)' }} lineClamp={1}>
                    {testState.error}
                  </Text>
                )}
              </Group>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
