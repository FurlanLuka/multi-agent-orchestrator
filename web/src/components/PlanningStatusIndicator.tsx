import { useState, useEffect } from 'react';
import { Card, Group, Stack, Text, Loader } from '@mantine/core';
import type { PlanningStatusEvent, PlanningPhase } from '../types';

interface Props {
  status: PlanningStatusEvent;
}

// Sub-messages that cycle during each phase
const phaseSubMessages: Record<PlanningPhase, string[]> = {
  exploring: ['Reading files...', 'Scanning structure...', 'Understanding codebase...'],
  analyzing: ['Thinking...', 'Planning approach...', 'Designing solution...'],
  generating: ['Writing tasks...', 'Defining tests...', 'Almost ready...'],
  complete: ['Done!']
};

export function PlanningStatusIndicator({ status }: Props) {
  const [subMessageIndex, setSubMessageIndex] = useState(0);

  // Cycle through sub-messages
  useEffect(() => {
    const interval = setInterval(() => {
      setSubMessageIndex(prev => (prev + 1) % phaseSubMessages[status.phase].length);
    }, 2000);
    return () => clearInterval(interval);
  }, [status.phase]);

  // Reset sub-message index when phase changes
  useEffect(() => {
    setSubMessageIndex(0);
  }, [status.phase]);

  const subMessages = phaseSubMessages[status.phase];
  const currentSubMessage = subMessages[subMessageIndex];

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
        <Stack gap={2}>
          <Text fw={500} size="sm" c="blue.7">
            {status.message}
          </Text>
          <Text size="xs" c="dimmed">
            {currentSubMessage}
          </Text>
          {status.project && (
            <Text size="xs" c="blue.5">
              Project: {status.project}
            </Text>
          )}
        </Stack>
      </Group>
    </Card>
  );
}
