import { Card, Group, Text, Loader, Badge, Button, Stack } from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import type { PlanningStatusEvent } from '@orchy/types';

interface Props {
  status: PlanningStatusEvent;
  onRetry?: () => void;
}

// Phase labels for display
const phaseLabels: Record<string, string> = {
  exploring: 'Exploring',
  analyzing: 'Analyzing',
  generating: 'Generating',
  complete: 'Complete',
  error: 'Error'
};

export function PlanningStatusIndicator({ status, onRetry }: Props) {
  // Error state - show red card with retry button
  if (status.phase === 'error') {
    return (
      <Card
        p="md"
        radius="md"
        withBorder
        style={{
          backgroundColor: 'var(--mantine-color-red-0)',
          borderColor: 'var(--mantine-color-red-3)',
        }}
      >
        <Stack gap="sm">
          <Group gap="md">
            <IconAlertCircle size={20} color="var(--mantine-color-red-6)" />
            <Text fw={500} size="sm" c="red.7">
              {status.message}
            </Text>
            <Badge size="xs" variant="light" color="red">
              {phaseLabels[status.phase]}
            </Badge>
          </Group>
          {status.errorDetails && (
            <Text size="xs" c="red.6" style={{ fontFamily: 'monospace' }}>
              {status.errorDetails}
            </Text>
          )}
          {onRetry && (
            <Group>
              <Button
                size="xs"
                variant="light"
                color="red"
                leftSection={<IconRefresh size={14} />}
                onClick={onRetry}
              >
                Retry
              </Button>
            </Group>
          )}
        </Stack>
      </Card>
    );
  }

  // Normal status - blue card with spinner
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
