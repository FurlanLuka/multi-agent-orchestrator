import { Card, Group, Badge, Text, ThemeIcon, Accordion, Stack, Code, Box } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import type { RequestFlow } from '../types';

interface CompletedFlowCardProps {
  flow: RequestFlow;
}

function getFlowLabel(type: string, passed?: boolean): string {
  switch (type) {
    case 'e2e': return passed ? 'E2E Passed' : 'E2E Failed';
    case 'task': return passed ? 'Task Complete' : 'Task Failed';
    case 'planning': return 'Plan';
    case 'fix': return passed ? 'Fix Applied' : 'Fix Failed';
    case 'waiting': return 'Dependency';
    default: return type;
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function CompletedFlowCard({ flow }: CompletedFlowCardProps) {
  const passed = flow.result?.passed ?? (flow.status === 'completed');
  const Icon = passed ? IconCheck : IconX;
  const color = passed ? 'green' : 'red';
  const hasDetails = flow.result?.details || flow.steps.length > 1;

  // Simple compact card without expandable details
  if (!hasDetails) {
    return (
      <Card p="xs" withBorder radius="sm" style={{ borderColor: `var(--mantine-color-${color}-3)` }}>
        <Group gap="sm" justify="space-between">
          <Group gap="sm">
            <ThemeIcon size="sm" color={color} variant="light" radius="xl">
              <Icon size={14} />
            </ThemeIcon>
            <Text size="sm" fw={500}>
              {getFlowLabel(flow.type, passed)}
            </Text>
            {flow.taskName && (
              <Text size="xs" c="dimmed">"{flow.taskName}"</Text>
            )}
          </Group>
          <Group gap="xs">
            {flow.project && (
              <Badge size="xs" variant="light" color="gray">
                {flow.project}
              </Badge>
            )}
            <Text size="xs" c="dimmed">
              {flow.completedAt ? formatTimestamp(flow.completedAt) : ''}
            </Text>
          </Group>
        </Group>
        {flow.result?.summary && (
          <Text size="xs" c="dimmed" mt="xs" lineClamp={1}>
            {flow.result.summary}
          </Text>
        )}
      </Card>
    );
  }

  // Expandable card with details
  return (
    <Accordion
      variant="filled"
      radius="sm"
      styles={{
        item: {
          backgroundColor: `var(--mantine-color-${color}-0)`,
          border: `1px solid var(--mantine-color-${color}-3)`,
          borderRadius: 'var(--mantine-radius-sm)',
        },
        control: { padding: '8px 12px' },
        panel: { padding: '0 12px 12px' },
      }}
    >
      <Accordion.Item value={flow.id}>
        <Accordion.Control
          icon={
            <ThemeIcon size="sm" color={color} variant="light" radius="xl">
              <Icon size={14} />
            </ThemeIcon>
          }
        >
          <Group gap="sm" justify="space-between" wrap="nowrap" style={{ flex: 1 }}>
            <Group gap="xs">
              <Text size="sm" fw={500}>
                {getFlowLabel(flow.type, passed)}
              </Text>
              {flow.taskName && (
                <Text size="xs" c="dimmed">"{flow.taskName}"</Text>
              )}
            </Group>
            <Group gap="xs">
              {flow.project && (
                <Badge size="xs" variant="light" color="gray">
                  {flow.project}
                </Badge>
              )}
            </Group>
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="xs">
            {/* Summary */}
            {flow.result?.summary && (
              <Text size="sm" c="dimmed">
                {flow.result.summary}
              </Text>
            )}

            {/* Steps timeline */}
            {flow.steps.length > 1 && (
              <Box>
                <Text size="xs" fw={500} mb="xs">Steps:</Text>
                <Stack gap={4}>
                  {flow.steps.map((step) => (
                    <Group key={step.id} gap="xs">
                      <ThemeIcon
                        size="xs"
                        color={step.status === 'completed' ? 'green' : step.status === 'failed' ? 'red' : 'gray'}
                        variant="light"
                        radius="xl"
                      >
                        {step.status === 'completed' ? <IconCheck size={10} /> : step.status === 'failed' ? <IconX size={10} /> : null}
                      </ThemeIcon>
                      <Text size="xs" c="dimmed">{step.message}</Text>
                    </Group>
                  ))}
                </Stack>
              </Box>
            )}

            {/* Details */}
            {flow.result?.details && (
              <Box
                style={{
                  backgroundColor: 'var(--mantine-color-dark-8)',
                  borderRadius: 'var(--mantine-radius-sm)',
                  padding: '8px',
                }}
              >
                <Code
                  block
                  style={{
                    fontSize: '11px',
                    maxHeight: '150px',
                    overflow: 'auto',
                    backgroundColor: 'transparent',
                    color: 'var(--mantine-color-gray-4)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {flow.result.details}
                </Code>
              </Box>
            )}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
