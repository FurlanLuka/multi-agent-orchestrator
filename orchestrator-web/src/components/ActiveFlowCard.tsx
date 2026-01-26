import { Card, Group, Badge, Text, Loader, Stack } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import type { RequestFlow } from '@aio/types';

interface ActiveFlowCardProps {
  flow: RequestFlow;
}

function getFlowColor(type: string): string {
  switch (type) {
    case 'e2e': return 'violet';
    case 'task': return 'blue';
    case 'planning': return 'cyan';
    case 'fix': return 'orange';
    case 'info': return 'gray';
    default: return 'blue';
  }
}

export function ActiveFlowCard({ flow }: ActiveFlowCardProps) {
  const activeStep = flow.steps.find(s => s.status === 'active');
  const completedSteps = flow.steps.filter(s => s.status === 'completed');
  const color = getFlowColor(flow.type);

  return (
    <Card
      p="sm"
      radius="md"
      withBorder
      style={{
        backgroundColor: `var(--mantine-color-${color}-0)`,
        borderColor: `var(--mantine-color-${color}-3)`,
      }}
    >
      {/* Current active step with spinner */}
      {activeStep && (
        <Group gap="sm" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <Loader size={16} color={color} />
            <Text size="sm" c={`${color}.7`}>
              {activeStep.message}
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            {flow.taskName && (
              <Text size="xs" c="dimmed" lineClamp={1} style={{ maxWidth: 150 }}>
                {flow.taskName}
              </Text>
            )}
            {flow.project && (
              <Badge size="xs" variant="light" color={color}>
                {flow.project}
              </Badge>
            )}
          </Group>
        </Group>
      )}

      {/* Show completed steps if any */}
      {completedSteps.length > 0 && (
        <Stack gap={4} mt={activeStep ? 'xs' : 0}>
          {completedSteps.map((step) => (
            <Group key={step.id} gap="xs">
              <IconCheck size={12} color={`var(--mantine-color-green-6)`} />
              <Text size="xs" c="dimmed">{step.message}</Text>
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  );
}
