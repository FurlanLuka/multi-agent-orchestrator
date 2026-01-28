import { useState, memo, useMemo, useEffect } from 'react';
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
  IconChevronRight,
  IconChevronDown,
} from '@tabler/icons-react';
import type { Plan, TaskState, ProjectTestState } from '@aio/types';
import { MarkdownMessage } from './MarkdownMessage';
import { MermaidDiagram } from './MermaidDiagram';
import { TaskList } from './plan/TaskList';
import { TestList } from './plan/TestList';

interface Props {
  plan: Plan;
  taskStates?: TaskState[];
  testStates?: Record<string, ProjectTestState>;
  isApproval?: boolean;
}

// Project status badge based on all tasks AND E2E test states
function ProjectStatusBadge({ project, taskStates, testStates }: {
  project: string;
  taskStates?: TaskState[];
  testStates?: Record<string, ProjectTestState>;
}) {
  if (!taskStates) return null;

  const projectTasks = taskStates.filter(t => t.project === project);
  if (projectTasks.length === 0) return null;

  const completedCount = projectTasks.filter(t => t.status === 'completed').length;
  const failedCount = projectTasks.filter(t => t.status === 'failed' || t.status === 'e2e_failed').length;
  const workingCount = projectTasks.filter(t =>
    t.status === 'working' || t.status === 'verifying' || t.status === 'fixing' || t.status === 'e2e'
  ).length;

  // Check E2E test status
  const projectTests = testStates?.[project]?.scenarios || [];
  const hasTests = projectTests.length > 0;
  const allTestsPassed = hasTests && projectTests.every(s => s.status === 'passed');
  const anyTestFailed = hasTests && projectTests.some(s => s.status === 'failed');
  const testsRunning = hasTests && projectTests.some(s => s.status === 'running');
  const testsPending = hasTests && projectTests.some(s => s.status === 'pending');

  if (failedCount > 0 || anyTestFailed) {
    return <Badge size="xs" color="red" variant="filled">{failedCount > 0 ? `${failedCount} failed` : 'tests failed'}</Badge>;
  }
  if (workingCount > 0) {
    return <Badge size="xs" color="blue" variant="light">working...</Badge>;
  }
  if (testsRunning) {
    return <Badge size="xs" color="violet" variant="light">testing...</Badge>;
  }
  if (completedCount === projectTasks.length) {
    if (hasTests && !allTestsPassed) {
      if (testsPending) {
        return <Badge size="xs" color="yellow" variant="light">awaiting tests</Badge>;
      }
      return <Badge size="xs" color="gray" variant="light">tasks done</Badge>;
    }
    return <Badge size="xs" color="green" variant="filled">complete</Badge>;
  }
  return <Badge size="xs" color="gray" variant="light">{completedCount}/{projectTasks.length}</Badge>;
}

export const TabbedPlanView = memo(function TabbedPlanView({ plan, taskStates, testStates, isApproval }: Props) {
  const tasks = plan?.tasks || [];
  const projectsRaw = useMemo(() => [...new Set(tasks.map(t => t.project))], [tasks]);

  // Track completion order for stable sorting
  const [completionOrder, setCompletionOrder] = useState<Map<string, number>>(new Map());

  // Calculate which projects are truly complete
  const projectCompletionStatus = useMemo(() => {
    const status = new Map<string, boolean>();
    projectsRaw.forEach(project => {
      if (!taskStates) {
        status.set(project, false);
        return;
      }
      const projectTasks = taskStates.filter(t => t.project === project);
      const allTasksComplete = projectTasks.length > 0 &&
        projectTasks.every(t => t.status === 'completed');

      if (!allTasksComplete) {
        status.set(project, false);
        return;
      }

      const projectTests = testStates?.[project]?.scenarios || [];
      const testsComplete = projectTests.length === 0 ||
        projectTests.every(s => s.status === 'passed');

      status.set(project, testsComplete);
    });
    return status;
  }, [projectsRaw, taskStates, testStates]);

  // Update completion order when projects complete
  useEffect(() => {
    let hasNewCompletions = false;
    const newOrder = new Map(completionOrder);

    projectCompletionStatus.forEach((isComplete, project) => {
      if (isComplete && !newOrder.has(project)) {
        newOrder.set(project, Date.now());
        hasNewCompletions = true;
      }
    });

    if (hasNewCompletions) {
      setCompletionOrder(newOrder);
    }
  }, [projectCompletionStatus, completionOrder]);

  // Sort projects: completed first, in-progress at bottom
  const projects = useMemo(() => {
    if (isApproval || !taskStates) return projectsRaw;

    return [...projectsRaw].sort((a, b) => {
      const aComplete = projectCompletionStatus.get(a);
      const bComplete = projectCompletionStatus.get(b);

      if (aComplete && bComplete) {
        const aTime = completionOrder.get(a) || 0;
        const bTime = completionOrder.get(b) || 0;
        return aTime - bTime;
      }

      if (aComplete && !bComplete) return -1;
      if (!aComplete && bComplete) return 1;

      return projectsRaw.indexOf(a) - projectsRaw.indexOf(b);
    });
  }, [projectsRaw, projectCompletionStatus, completionOrder, isApproval, taskStates]);

  const [activeTab, setActiveTab] = useState<string | null>(projects[0] || null);
  // Architecture expanded by default for approval, collapsed for execution view
  const [architectureExpanded, setArchitectureExpanded] = useState(isApproval ?? false);

  // Get tasks for active project - memoized
  const projectTasks = useMemo(
    () => tasks.map((task, idx) => ({ task, idx })).filter(({ task }) => task.project === activeTab),
    [tasks, activeTab]
  );
  const testPlan = plan?.testPlan || {};
  const projectTests = useMemo(
    () => activeTab ? (testPlan[activeTab] || []) : [],
    [testPlan, activeTab]
  );

  return (
    <Stack gap="sm">
      {/* Header with feature and overview */}
      {isApproval && (
        <Box>
          <Title order={4}>{plan.feature}</Title>
          {plan.overview && (
            <Text size="sm" c="dimmed" mt="xs">
              {plan.overview}
            </Text>
          )}
        </Box>
      )}

      {!isApproval && plan.overview && (
        <Text size="sm" c="dimmed">
          {plan.overview}
        </Text>
      )}

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
              {plan.architecture.includes('```') ? (
                <MarkdownMessage content={plan.architecture} />
              ) : (
                <MermaidDiagram chart={plan.architecture} />
              )}
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
                {!isApproval && <ProjectStatusBadge project={project} taskStates={taskStates} testStates={testStates} />}
              </Group>
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {projects.map(project => (
          <Tabs.Panel key={project} value={project} pt="sm">
            <Stack gap="sm">
              {/* Tasks Section */}
              <TaskList
                tasks={projectTasks}
                taskStates={taskStates}
                isApproval={isApproval}
              />

              {/* Tests Section */}
              {projectTests.length > 0 && (
                <TestList
                  project={project}
                  scenarios={projectTests}
                  taskStates={taskStates}
                  testStates={testStates}
                  isApproval={isApproval}
                />
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
