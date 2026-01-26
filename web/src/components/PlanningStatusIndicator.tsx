import { Card, Group, Text, Loader, Badge } from '@mantine/core';
import type { PlanningStatusEvent } from '../types';

interface Props {
  status: PlanningStatusEvent;
}

// Phase labels for display
const phaseLabels: Record<string, string> = {
  exploring: 'Exploring',
  analyzing: 'Analyzing',
  generating: 'Generating',
  complete: 'Complete'
};

export function PlanningStatusIndicator({ status }: Props) {
  return (
    <Card
      p="md"
      radius="md"
      withBorder
      style={{
        backgroundColor: 'var(--mantine-color-blue-0)',
        borderColor: 'var(--mantine-color-blue-3)',
      }}
    >
      <Group gap="md">
        <Loader size="sm" color="blue" />
        <Text fw={500} size="sm" c="blue.7">
          {status.message}
        </Text>
        <Badge size="xs" variant="light" color="blue">
          {phaseLabels[status.phase] || status.phase}
        </Badge>
        {status.project && (
          <Badge size="xs" variant="outline" color="gray">
            {status.project}
          </Badge>
        )}
      </Group>
    </Card>
  );
}
