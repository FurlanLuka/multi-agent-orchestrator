import { Card, Group, Badge, Text, Loader, Stack, ThemeIcon, Box } from '@mantine/core';
import { IconArrowDown } from '@tabler/icons-react';
import type { RequestFlow } from '../types';

interface ActiveFlowCardProps {
  flow: RequestFlow;
}

function getFlowLabel(type: string): string {
  switch (type) {
    case 'e2e': return 'E2E';
    case 'task': return 'TASK';
    case 'planning': return 'PLAN';
    case 'fix': return 'FIX';
    case 'waiting': return 'WAIT';
    default: return type.toUpperCase();
  }
}

export function ActiveFlowCard({ flow }: ActiveFlowCardProps) {
  const activeStep = flow.steps.find(s => s.status === 'active');
  const completedSteps = flow.steps.filter(s => s.status === 'completed');

  return (
    <Card
      p="sm"
      withBorder
      radius="md"
      style={{
        borderLeft: '3px solid var(--mantine-color-blue-5)',
        backgroundColor: 'var(--mantine-color-blue-0)',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Badge size="sm" color="blue" variant="filled">
            {getFlowLabel(flow.type)}
          </Badge>
          {flow.taskName && (
            <Text size="xs" fw={500} c="blue.7">
              {flow.taskName}
            </Text>
          )}
        </Group>
        {flow.project && (
          <Badge size="xs" variant="light" color="gray">
            {flow.project}
          </Badge>
        )}
      </Group>

      {/* Show completed steps with arrows */}
      {completedSteps.length > 0 && (
        <Stack gap={4} mb="xs">
          {completedSteps.map((step, idx) => (
            <Box key={step.id}>
              <Group gap="xs">
                <ThemeIcon size="xs" color="green" variant="light" radius="xl">
                  <Text size="xs">✓</Text>
                </ThemeIcon>
                <Text size="xs" c="dimmed">{step.message}</Text>
              </Group>
              {idx < completedSteps.length - 1 || activeStep ? (
                <Box pl="md" py={2}>
                  <IconArrowDown size={10} color="var(--mantine-color-gray-5)" />
                </Box>
              ) : null}
            </Box>
          ))}
        </Stack>
      )}

      {/* Current active step with spinner */}
      {activeStep && (
        <Group gap="sm">
          <Loader size={14} color="blue" />
          <Text size="sm" fw={500}>{activeStep.message}</Text>
        </Group>
      )}

      {/* Progress indicator */}
      {completedSteps.length > 0 && !activeStep && (
        <Text size="xs" c="dimmed" mt="xs">
          {completedSteps.length} step{completedSteps.length > 1 ? 's' : ''} completed
        </Text>
      )}
    </Card>
  );
}
