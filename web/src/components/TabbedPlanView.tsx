import { useState, memo, useMemo, useRef, useEffect } from 'react';
import {
  Stack,
  Title,
  Text,
  Tabs,
  Group,
  Badge,
  ThemeIcon,
  Box,
  Divider,
  Collapse,
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
import type { Plan, TaskState, TaskStatus, ProjectTestState, TestScenarioStatus } from '../types';
import { MarkdownMessage } from './MarkdownMessage';

interface Props {
  plan: Plan;
  taskStates?: TaskState[];           // For execution tracking
  testStates?: Record<string, ProjectTestState>; // For test tracking
  isApproval?: boolean;               // True when showing for approval (no tracking)
}

// Get status icon for tasks
function getTaskStatusIcon(status?: TaskStatus) {
  if (!status || status === 'pending') return <IconCircle size={16} />;
  if (status === 'completed') return <IconCircleCheck size={16} />;
  if (status === 'failed' || status === 'e2e_failed') return <IconCircleX size={16} />;
  if (status === 'working' || status === 'verifying' || status === 'fixing' || status === 'e2e') {
    return <IconLoader size={16} className="animate-spin" />;
  }
  if (status === 'waiting') return <IconClock size={16} />;
  return <IconCircle size={16} />;
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

// Get status icon for tests
function getTestStatusIcon(status?: TestScenarioStatus) {
  if (!status || status === 'pending') return <IconCircle size={16} />;
  if (status === 'passed') return <IconCircleCheck size={16} />;
  if (status === 'failed') return <IconCircleX size={16} />;
  if (status === 'running') return <IconLoader size={16} className="animate-spin" />;
  return <IconCircle size={16} />;
}

// Get status color for tests
function getTestStatusColor(status?: TestScenarioStatus): string {
  if (!status || status === 'pending') return 'gray';
  if (status === 'passed') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'running') return 'blue';
  return 'gray';
}

// Project status badge based on all tasks for that project
function ProjectStatusBadge({ project, taskStates }: { project: string; taskStates?: TaskState[] }) {
  if (!taskStates) return null;

  const projectTasks = taskStates.filter(t => t.project === project);
  if (projectTasks.length === 0) return null;

  const completedCount = projectTasks.filter(t => t.status === 'completed').length;
  const failedCount = projectTasks.filter(t => t.status === 'failed' || t.status === 'e2e_failed').length;
  const workingCount = projectTasks.filter(t =>
    t.status === 'working' || t.status === 'verifying' || t.status === 'fixing' || t.status === 'e2e'
  ).length;

  if (failedCount > 0) {
    return <Badge size="xs" color="red" variant="filled">{failedCount} failed</Badge>;
  }
  if (workingCount > 0) {
    return <Badge size="xs" color="blue" variant="light">working...</Badge>;
  }
  if (completedCount === projectTasks.length) {
    return <Badge size="xs" color="green" variant="filled">complete</Badge>;
  }
  return <Badge size="xs" color="gray" variant="light">{completedCount}/{projectTasks.length}</Badge>;
}

// Get E2E status for a project based on task states
function getProjectE2EStatus(project: string, taskStates?: TaskState[], testStates?: Record<string, ProjectTestState>):
  'waiting' | 'in_progress' | 'passed' | 'failed' | null {
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

export const TabbedPlanView = memo(function TabbedPlanView({ plan, taskStates, testStates, isApproval }: Props) {
  const projectsRaw = useMemo(() => [...new Set(plan.tasks.map(t => t.project))], [plan.tasks]);

  // Track completion order for stable sorting (completed projects stay in place)
  const completionOrderRef = useRef<Map<string, number>>(new Map());

  // Calculate which projects are truly complete (tasks done + tests passed)
  const projectCompletionStatus = useMemo(() => {
    const status = new Map<string, boolean>();
    projectsRaw.forEach(project => {
      if (!taskStates) {
        status.set(project, false);
        return;
      }
      // All tasks must be 'completed' (not e2e, working, etc.)
      const projectTasks = taskStates.filter(t => t.project === project);
      const allTasksComplete = projectTasks.length > 0 &&
        projectTasks.every(t => t.status === 'completed');

      if (!allTasksComplete) {
        status.set(project, false);
        return;
      }

      // Also check tests - if project has tests, all must be passed
      const projectTests = testStates?.[project]?.scenarios || [];
      const testsComplete = projectTests.length === 0 ||
        projectTests.every(s => s.status === 'passed');

      status.set(project, testsComplete);
    });
    return status;
  }, [projectsRaw, taskStates, testStates]);

  // Update completion order when projects complete
  useEffect(() => {
    projectCompletionStatus.forEach((isComplete, project) => {
      if (isComplete && !completionOrderRef.current.has(project)) {
        completionOrderRef.current.set(project, Date.now());
      }
    });
  }, [projectCompletionStatus]);

  // Sort projects: completed first (by completion order), in-progress at bottom
  const projects = useMemo(() => {
    if (isApproval || !taskStates) return projectsRaw;

    return [...projectsRaw].sort((a, b) => {
      const aComplete = projectCompletionStatus.get(a);
      const bComplete = projectCompletionStatus.get(b);

      // Both complete: sort by completion order
      if (aComplete && bComplete) {
        const aTime = completionOrderRef.current.get(a) || 0;
        const bTime = completionOrderRef.current.get(b) || 0;
        return aTime - bTime;
      }

      // Complete projects first
      if (aComplete && !bComplete) return -1;
      if (!aComplete && bComplete) return 1;

      // Both in-progress: maintain original order
      return projectsRaw.indexOf(a) - projectsRaw.indexOf(b);
    });
  }, [projectsRaw, projectCompletionStatus, isApproval, taskStates]);

  const [activeTab, setActiveTab] = useState<string | null>(projects[0] || null);
  const [expandedTaskIdx, setExpandedTaskIdx] = useState<number | null>(null);
  // Architecture expanded by default for approval, collapsed for execution view
  const [architectureExpanded, setArchitectureExpanded] = useState(isApproval ?? false);

  // Get tasks and tests for active project - memoized
  const projectTasks = useMemo(
    () => plan.tasks.map((task, idx) => ({ task, idx })).filter(({ task }) => task.project === activeTab),
    [plan.tasks, activeTab]
  );
  const projectTests = useMemo(
    () => activeTab ? (plan.testPlan[activeTab] || []) : [],
    [plan.testPlan, activeTab]
  );

  return (
    <Stack gap="sm">
      {/* Header with feature and overview */}
      <Box>
        <Title order={4}>{plan.feature}</Title>
        {plan.overview && (
          <Text size="sm" c="dimmed" mt="xs">
            {plan.overview}
          </Text>
        )}
      </Box>

      {/* Collapsible Architecture diagram */}
      {plan.architecture && (
        <Box>
          <UnstyledButton
            onClick={() => setArchitectureExpanded(!architectureExpanded)}
            style={{ width: '100%' }}
          >
            <Group gap="xs">
              <ThemeIcon size="xs" variant="transparent" color="gray">
                {architectureExpanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
              </ThemeIcon>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                Architecture
              </Text>
            </Group>
          </UnstyledButton>
          <Collapse in={architectureExpanded}>
            <Box
              style={{
                backgroundColor: 'var(--mantine-color-gray-0)',
                padding: '8px',
                borderRadius: 'var(--mantine-radius-sm)',
                marginTop: '4px',
              }}
            >
              <MarkdownMessage content={plan.architecture} />
            </Box>
          </Collapse>
        </Box>
      )}

      <Divider />

      {/* Project tabs */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          {projects.map(project => (
            <Tabs.Tab key={project} value={project}>
              <Group gap="xs">
                <Text size="sm">{project}</Text>
                {!isApproval && <ProjectStatusBadge project={project} taskStates={taskStates} />}
              </Group>
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {projects.map(project => (
          <Tabs.Panel key={project} value={project} pt="sm">
            <Stack gap="sm">
              {/* Tasks Section - Compact grouped list */}
              <Box>
                <Text fw={600} size="xs" c="dimmed" tt="uppercase" mb={4}>Tasks</Text>
                <Box
                  style={{
                    border: '1px solid var(--mantine-color-gray-3)',
                    borderRadius: 'var(--mantine-radius-sm)',
                    overflow: 'hidden',
                  }}
                >
                  {projectTasks.map(({ task, idx }, i) => {
                    const state = taskStates?.find(t => t.taskIndex === idx);
                    const status = state?.status;
                    const icon = isApproval ? <IconCircle size={14} /> : getTaskStatusIcon(status);
                    const color = isApproval ? 'gray' : getTaskStatusColor(status);
                    const isExpanded = expandedTaskIdx === idx;
                    const isLast = i === projectTasks.length - 1;

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
                        {task.task && (
                          <Collapse in={isExpanded}>
                            <Box
                              p="xs"
                              style={{
                                backgroundColor: 'var(--mantine-color-gray-0)',
                                borderBottom: isLast ? 'none' : '1px solid var(--mantine-color-gray-2)',
                              }}
                            >
                              <MarkdownMessage content={task.task} />
                            </Box>
                          </Collapse>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              {/* Tests Section - Compact grouped list */}
              {projectTests.length > 0 && (
                <Box>
                  <Group gap="xs" mb={4}>
                    <Text fw={600} size="xs" c="dimmed" tt="uppercase">Tests</Text>
                    {!isApproval && (() => {
                      const e2eStatus = getProjectE2EStatus(project, taskStates, testStates);
                      if (!e2eStatus) return null;
                      const statusConfig = {
                        waiting: { label: 'Waiting for Tasks', color: 'gray' },
                        in_progress: { label: 'E2E In Progress', color: 'blue' },
                        passed: { label: 'All Passed', color: 'green' },
                        failed: { label: 'Failed', color: 'red' },
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
                      border: '1px solid var(--mantine-color-gray-3)',
                      borderRadius: 'var(--mantine-radius-sm)',
                      overflow: 'hidden',
                    }}
                  >
                    {projectTests.map((scenario, idx) => {
                      const testState = testStates?.[project]?.scenarios?.find(s => s.name === scenario);
                      const status = testState?.status;
                      const icon = isApproval ? <IconCircle size={14} /> : getTestStatusIcon(status);
                      const color = isApproval ? 'gray' : getTestStatusColor(status);
                      const isLast = idx === projectTests.length - 1;

                      return (
                        <Box
                          key={idx}
                          p="xs"
                          style={{
                            backgroundColor: `var(--mantine-color-${color}-0)`,
                            borderBottom: isLast ? 'none' : '1px solid var(--mantine-color-gray-2)',
                          }}
                        >
                          <Group gap="xs" wrap="nowrap">
                            <ThemeIcon size="xs" variant="transparent" color={color}>
                              {icon}
                            </ThemeIcon>
                            <Text size="sm" style={{ flex: 1 }} lineClamp={1}>
                              {scenario}
                            </Text>
                            {testState?.error && (
                              <Text size="xs" c="red" style={{ maxWidth: '150px' }} lineClamp={1}>
                                {testState.error}
                              </Text>
                            )}
                          </Group>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              )}
            </Stack>
          </Tabs.Panel>
        ))}
      </Tabs>

      {/* CSS for spin animation */}
      <style>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Stack>
  );
});
